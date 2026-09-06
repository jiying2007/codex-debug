'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const corpus=require('../quality/promotion-corpus.json');
const policy=require('../quality/promotion-admission-policy.json');
const {stableDigest,createRecord}=require('../scripts/model-evaluation');
const {promotionReadiness,toEvaluationCorpus}=require('../scripts/promotion-corpus');
const {evaluateAdmission}=require('../scripts/promotion-admission');
const {validateAdmissionReceipt}=require('../scripts/validate-promotion-admission');

function clone(value){return JSON.parse(JSON.stringify(value));}
function phase(tokens=10){return {model:'gpt-test',codexVersion:'0.0.0-test',providerMode:'openai',runtimeSource:'test',modelEvidenceDigest:'',usage:{inputTokens:tokens,outputTokens:0,totalTokens:tokens,cachedInputTokens:0},requestEstimate:null,durationMs:1};}
function runContext(debugCommit,runId='77'){return {workflow:'Promotion Model Evaluation',runId,runAttempt:'1',event:'workflow_dispatch',repository:'jiying2007/codex-debug',sourceSha:debugCommit};}
function qualificationFor(reviewed,{debugCommit='a'.repeat(40),coreCommit='b'.repeat(40),runId='77'}={}){
  const record={schemaVersion:1,kind:'codex-debug-promotion-corpus-qualification',recordedAt:'2026-09-07T00:00:00.000Z',debugCommit,coreCommit,corpusDigest:stableDigest(reviewed),readiness:promotionReadiness(reviewed),runContext:runContext(debugCommit,runId),cases:reviewed.cases.map(item=>({caseId:item.id,repository:item.repository,anchorRef:item.anchorRef,badCommit:item.badCommit,fixedCommit:item.fixedCommit,commandDigest:stableDigest(item.reproduction.command),badSummary:{runs:1,failures:1,timeouts:0,reproducibleFailure:true},fixedSummary:{runs:1,failures:0,timeouts:0,reproducibleFailure:false},badRepresentativeDigest:stableDigest(`bad:${item.id}`),fixedRepresentativeDigest:stableDigest(`fixed:${item.id}`),transitionDigest:stableDigest(`transition:${item.id}`)}))};
  record.digest=stableDigest(record);return record;
}
function liveRecordFor(reviewed,{debugCommit='a'.repeat(40),coreCommit='b'.repeat(40),runId='77',promotionEligible=false,tokens=10}={}){
  const evalCorpus=toEvaluationCorpus(reviewed),cases=evalCorpus.cases.map(spec=>{const terms=spec.expected.rootCauseTerms||[],text=terms.length?terms.join(' '):'insufficient evidence';return {caseId:spec.id,evidenceDigest:stableDigest(`evidence:${spec.id}`),expectationDigest:spec.expectationDigest,judgment:{rootCauseText:text,rootCauseDigest:stableDigest(text),causalAssessment:spec.expected.assessment,patchProposed:false,patchDisposition:'none',patchApplicable:null,supportedHypotheses:terms.length?[text]:[]},execution:{hypothesis:phase(tokens),causalVerification:phase(tokens)}};});
  const base=createRecord({source:'live',promotionEligible,debugCommit,coreCommit,corpus:evalCorpus,cases,recordedAt:'2026-09-07T00:01:00.000Z'}),copy={...base};delete copy.recordDigest;copy.runContext=runContext(debugCommit,runId);copy.recordDigest=stableDigest(copy);return copy;
}
function fixture(){
  const qualification=qualificationFor(corpus),modelRecord=liveRecordFor(corpus),admission=evaluateAdmission({policy,reviewedCorpus:corpus,qualification,modelRecord,expectedDebugCommit:modelRecord.debugCommit,expectedCoreCommit:modelRecord.coreCommit,recordedAt:'2026-09-07T00:02:00.000Z'});
  return {qualification,modelRecord,admission};
}

test('promotion admission receipt revalidates against the exact policy qualification model and source binding',()=>{
  const {qualification,modelRecord,admission}=fixture();
  const result=validateAdmissionReceipt({admission,policy,reviewedCorpus:corpus,qualification,modelRecord,expectedDebugCommit:modelRecord.debugCommit,expectedCoreCommit:modelRecord.coreCommit});
  assert.equal(result.digest,admission.digest);
  assert.equal(result.ready,false);
  assert.ok(result.gaps.includes('promotion admission policy is not reviewed'));
});

test('promotion admission receipt rejects direct payload tampering even when sidecars are unchanged',()=>{
  const {qualification,modelRecord,admission}=fixture(),changed=clone(admission);
  changed.metrics.falseSupport=9;
  assert.throws(()=>validateAdmissionReceipt({admission:changed,policy,reviewedCorpus:corpus,qualification,modelRecord}),/self digest mismatch/);
});

test('promotion admission receipt rejects a self-rehashed forged metric because evidence reconstruction differs',()=>{
  const {qualification,modelRecord,admission}=fixture(),changed=clone(admission);
  changed.metrics.tokensPerCase=999999;
  delete changed.digest;changed.digest=stableDigest(changed);
  assert.throws(()=>validateAdmissionReceipt({admission:changed,policy,reviewedCorpus:corpus,qualification,modelRecord}),/does not match bound policy\/qualification\/model evidence/);
});

test('promotion admission receipt rejects a different digest-valid policy sidecar',()=>{
  const {qualification,modelRecord,admission}=fixture(),changedPolicy=clone(policy);
  changedPolicy.quality.minimumInsufficientEvidenceAccuracy=0.5;
  delete changedPolicy.policyDigest;changedPolicy.policyDigest=stableDigest(changedPolicy);
  assert.throws(()=>validateAdmissionReceipt({admission,policy:changedPolicy,reviewedCorpus:corpus,qualification,modelRecord}),/does not match bound policy\/qualification\/model evidence/);
});

test('promotion workflow independently revalidates admission and retains the exact policy sidecar read-only',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','promotion-model-eval.yml'),'utf8');
  const generate=workflow.indexOf('Bind qualification, live metrics, and promotion admission policy');
  const revalidate=workflow.indexOf('Re-validate promotion admission receipt');
  assert.ok(generate>0&&revalidate>generate);
  assert.match(workflow,/cp quality\/promotion-admission-policy\.json PROMOTION_ADMISSION_POLICY\.json/);
  assert.match(workflow,/validate-promotion-admission\.js/);
  assert.match(workflow,/--admission PROMOTION_ADMISSION\.json/);
  assert.match(workflow,/PROMOTION_ADMISSION_POLICY\.json/);
  assert.match(workflow,/permissions:\s*\n\s+contents:\s*read\b/);
  assert.doesNotMatch(workflow,/\bcontents:\s*write\b/i);
  assert.doesNotMatch(workflow,/\bid-token:\s*write\b/i);
  assert.doesNotMatch(workflow,/\bgit\s+push\b/i);
});
