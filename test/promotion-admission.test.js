'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const corpus=require('../quality/promotion-corpus.json');
const policy=require('../quality/promotion-admission-policy.json');
const {stableDigest,createRecord}=require('../scripts/model-evaluation');
const {promotionReadiness,toEvaluationCorpus}=require('../scripts/promotion-corpus');
const {validateAdmissionPolicy,evaluateAdmission}=require('../scripts/promotion-admission');

function clone(value){return JSON.parse(JSON.stringify(value));}
function phase(tokens=10){return {model:'gpt-test',codexVersion:'0.0.0-test',providerMode:'openai',runtimeSource:'test',modelEvidenceDigest:'',usage:{inputTokens:tokens,outputTokens:0,totalTokens:tokens,cachedInputTokens:0},requestEstimate:null,durationMs:1};}
function runContext(debugCommit,runId='42'){return {workflow:'Promotion Model Evaluation',runId,runAttempt:'1',event:'workflow_dispatch',repository:'jiying2007/codex-debug',sourceSha:debugCommit};}
function qualificationFor(reviewed,{debugCommit='a'.repeat(40),coreCommit='b'.repeat(40),runId='42'}={}){
  const record={
    schemaVersion:1,
    kind:'codex-debug-promotion-corpus-qualification',
    recordedAt:'2026-09-06T00:00:00.000Z',
    debugCommit,
    coreCommit,
    corpusDigest:stableDigest(reviewed),
    readiness:promotionReadiness(reviewed),
    runContext:runContext(debugCommit,runId),
    cases:reviewed.cases.map(item=>({
      caseId:item.id,
      repository:item.repository,
      anchorRef:item.anchorRef,
      badCommit:item.badCommit,
      fixedCommit:item.fixedCommit,
      commandDigest:stableDigest(item.reproduction.command),
      badSummary:{runs:1,failures:1,timeouts:0,reproducibleFailure:true},
      fixedSummary:{runs:1,failures:0,timeouts:0,reproducibleFailure:false},
      badRepresentativeDigest:stableDigest(`bad:${item.id}`),
      fixedRepresentativeDigest:stableDigest(`fixed:${item.id}`),
      transitionDigest:stableDigest(`transition:${item.id}`)
    }))
  };
  record.digest=stableDigest(record);
  return record;
}
function liveRecordFor(reviewed,{debugCommit='a'.repeat(40),coreCommit='b'.repeat(40),runId='42',promotionEligible=false,tokens=10}={}){
  const evalCorpus=toEvaluationCorpus(reviewed);
  const cases=evalCorpus.cases.map(spec=>{
    const terms=spec.expected.rootCauseTerms||[],text=terms.length?terms.join(' '):'insufficient evidence';
    return {
      caseId:spec.id,
      evidenceDigest:stableDigest(`evidence:${spec.id}`),
      expectationDigest:spec.expectationDigest,
      judgment:{rootCauseText:text,rootCauseDigest:stableDigest(text),causalAssessment:spec.expected.assessment,patchProposed:false,patchDisposition:'none',patchApplicable:null,supportedHypotheses:terms.length?[text]:[]},
      execution:{hypothesis:phase(tokens),causalVerification:phase(tokens)}
    };
  });
  const base=createRecord({source:'live',promotionEligible,debugCommit,coreCommit,corpus:evalCorpus,cases,recordedAt:'2026-09-06T00:01:00.000Z'});
  const copy={...base};delete copy.recordDigest;copy.runContext=runContext(debugCommit,runId);copy.recordDigest=stableDigest(copy);return copy;
}
function reviewedPolicy(){
  const value=clone(policy);
  value.reviewed=true;
  value.quality.minimumAssessmentAccuracy=1;
  value.quality.minimumRootCauseTop1Accuracy=1;
  value.quality.minimumInsufficientEvidenceAccuracy=1;
  value.tokenEfficiency={calibrated:true,maximumTokensPerCase:100};
  const body={...value};delete body.policyDigest;value.policyDigest=stableDigest(body);return value;
}

test('checked-in admission policy is digest-bound and deliberately unreviewed until live calibration exists',()=>{
  validateAdmissionPolicy(policy);
  assert.equal(policy.reviewed,false);
  assert.equal(policy.tokenEfficiency.calibrated,false);
  assert.equal(policy.tokenEfficiency.maximumTokensPerCase,null);
  assert.equal(policy.safety.maximumFalseSupport,0);
  assert.equal(policy.safety.maximumFalseFixCandidates,0);
  assert.equal(policy.safety.maximumPatchPolicyViolations,0);
});

test('calibration admission binds qualification and model evidence but remains blocked by draft quality/token policy',()=>{
  const q=qualificationFor(corpus),r=liveRecordFor(corpus),a=evaluateAdmission({policy,reviewedCorpus:corpus,qualification:q,modelRecord:r,expectedDebugCommit:r.debugCommit,expectedCoreCommit:r.coreCommit});
  assert.equal(a.ready,false);
  assert.ok(a.gaps.includes('promotion admission policy is not reviewed'));
  assert.ok(a.gaps.includes('assessmentAccuracy threshold is not reviewed'));
  assert.ok(a.gaps.includes('rootCauseTop1Accuracy threshold is not reviewed'));
  assert.ok(a.gaps.includes('token efficiency is not calibrated'));
  assert.equal(a.metrics.falseSupport,0);
  assert.equal(a.metrics.falseFixCandidates,0);
  assert.equal(a.metrics.patchPolicyViolations,0);
  assert.match(a.digest,/^[0-9a-f]{64}$/);
});

test('reviewed calibrated policy admits only same-run qualification plus promotion-eligible perfect live evidence',()=>{
  const reviewed=clone(corpus);reviewed.promotionEligible=true;
  const q=qualificationFor(reviewed),r=liveRecordFor(reviewed,{promotionEligible:true}),p=reviewedPolicy();
  const a=evaluateAdmission({policy:p,reviewedCorpus:reviewed,qualification:q,modelRecord:r,expectedDebugCommit:r.debugCommit,expectedCoreCommit:r.coreCommit,requirePromotionEligible:true});
  assert.equal(a.ready,true);
  assert.deepEqual(a.gaps,[]);
  assert.equal(a.metrics.assessmentAccuracy,1);
  assert.equal(a.metrics.rootCauseTop1Accuracy,1);
  assert.equal(a.metrics.insufficientEvidenceAccuracy,1);
  assert.equal(a.requirePromotionEligible,true);
});

test('admission refuses qualification/model evidence assembled from different workflow runs',()=>{
  const q=qualificationFor(corpus,{runId:'41'}),r=liveRecordFor(corpus,{runId:'42'});
  assert.throws(()=>evaluateAdmission({policy,reviewedCorpus:corpus,qualification:q,modelRecord:r}),/runContext mismatch: runId/);
});

test('admission safety gates remain zero-tolerance even with a reviewed calibrated policy',()=>{
  const reviewed=clone(corpus);reviewed.promotionEligible=true;
  const q=qualificationFor(reviewed),base=liveRecordFor(reviewed,{promotionEligible:true}),p=reviewedPolicy();
  const changed=clone(base),insufficient=toEvaluationCorpus(reviewed).cases.find(x=>x.expected.assessment==='insufficient');
  const item=changed.cases.find(x=>x.caseId===insufficient.id);
  item.judgment.causalAssessment='supported';
  item.judgment.patchProposed=true;
  item.judgment.patchDisposition='accept';
  delete changed.recordDigest;changed.recordDigest=stableDigest(changed);
  const a=evaluateAdmission({policy:p,reviewedCorpus:reviewed,qualification:q,modelRecord:changed,requirePromotionEligible:true});
  assert.equal(a.ready,false);
  assert.ok(a.gaps.some(x=>x.startsWith('falseSupport ')));
  assert.ok(a.gaps.some(x=>x.startsWith('falseFixCandidates ')));
  assert.ok(a.gaps.some(x=>x.startsWith('patchPolicyViolations ')));
});

test('promotion model workflow creates same-run qualification and admission evidence without write authority',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','promotion-model-eval.yml'),'utf8');
  const qualificationIndex=workflow.indexOf('Qualify historical transitions for this exact evaluation run');
  const modelIndex=workflow.indexOf('Record historical live-model evaluation');
  const admissionIndex=workflow.indexOf('Bind qualification, live metrics, and promotion admission policy');
  assert.ok(qualificationIndex>0&&modelIndex>qualificationIndex&&admissionIndex>modelIndex);
  assert.match(workflow,/timeout-minutes:\s*60/);
  assert.match(workflow,/promotion-qualify\.js --output PROMOTION_CORPUS_QUALIFICATION\.json/);
  assert.match(workflow,/promotion-admission\.js/);
  assert.match(workflow,/--require-promotion-eligible/);
  assert.match(workflow,/PROMOTION_ADMISSION\.json/);
  assert.match(workflow,/permissions:\s*\n\s+contents:\s*read\b/);
  assert.doesNotMatch(workflow,/\bcontents:\s*write\b/i);
  assert.doesNotMatch(workflow,/\bid-token:\s*write\b/i);
  assert.doesNotMatch(workflow,/\bgit\s+push\b/i);
});
