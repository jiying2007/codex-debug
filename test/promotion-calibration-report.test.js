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
const {buildCalibrationReport,validateCalibrationReport,nearestRank}=require('../scripts/promotion-calibration-report');

function phase(tokens){return {model:'gpt-calibration-test',codexVersion:'0.0.0-test',providerMode:'openai',runtimeSource:'test',modelEvidenceDigest:'',usage:{inputTokens:tokens,outputTokens:0,totalTokens:tokens,cachedInputTokens:0},requestEstimate:null,durationMs:1};}
function runContext(debugCommit){return {workflow:'Promotion Model Evaluation',runId:'88',runAttempt:'1',event:'workflow_dispatch',repository:'jiying2007/codex-debug',sourceSha:debugCommit};}
function fixture(){
  const debugCommit='a'.repeat(40),coreCommit='b'.repeat(40),qualification={schemaVersion:1,kind:'codex-debug-promotion-corpus-qualification',recordedAt:'2026-09-07T00:00:00.000Z',debugCommit,coreCommit,corpusDigest:stableDigest(corpus),readiness:promotionReadiness(corpus),runContext:runContext(debugCommit),cases:corpus.cases.map(item=>({caseId:item.id,repository:item.repository,anchorRef:item.anchorRef,badCommit:item.badCommit,fixedCommit:item.fixedCommit,commandDigest:stableDigest(item.reproduction.command),badSummary:{runs:1,failures:1,timeouts:0,reproducibleFailure:true},fixedSummary:{runs:1,failures:0,timeouts:0,reproducibleFailure:false},badRepresentativeDigest:stableDigest(`bad:${item.id}`),fixedRepresentativeDigest:stableDigest(`fixed:${item.id}`),transitionDigest:stableDigest(`transition:${item.id}`)}))};qualification.digest=stableDigest(qualification);
  const evalCorpus=toEvaluationCorpus(corpus),cases=evalCorpus.cases.map((spec,index)=>{const terms=spec.expected.rootCauseTerms||[],text=terms.length?terms.join(' '):'insufficient evidence',p=phase(index+1);return {caseId:spec.id,evidenceDigest:stableDigest(`evidence:${spec.id}`),expectationDigest:spec.expectationDigest,judgment:{rootCauseText:text,rootCauseDigest:stableDigest(text),causalAssessment:spec.expected.assessment,patchProposed:false,patchDisposition:'none',patchApplicable:null,supportedHypotheses:terms.length?[text]:[]},execution:{hypothesis:p,causalVerification:p}};});
  const base=createRecord({source:'live',promotionEligible:false,debugCommit,coreCommit,corpus:evalCorpus,cases,recordedAt:'2026-09-07T00:01:00.000Z'}),modelRecord={...base};delete modelRecord.recordDigest;modelRecord.runContext=runContext(debugCommit);modelRecord.recordDigest=stableDigest(modelRecord);
  const admission=evaluateAdmission({policy,reviewedCorpus:corpus,qualification,modelRecord,expectedDebugCommit:debugCommit,expectedCoreCommit:coreCommit,recordedAt:'2026-09-07T00:02:00.000Z'});
  return {qualification,modelRecord,admission};
}

test('nearest-rank percentile is deterministic and bounded',()=>{assert.equal(nearestRank([1,2,3,4],0.5),2);assert.equal(nearestRank([1,2,3,4],0.95),4);assert.equal(nearestRank([],0.5),null);});

test('calibration report is review-only and exposes quality token patch and lineage review inputs',()=>{
  const {qualification,modelRecord,admission}=fixture(),report=buildCalibrationReport({policy,reviewedCorpus:corpus,qualification,modelRecord,admission,recordedAt:'2026-09-07T00:03:00.000Z'});
  validateCalibrationReport(report);
  assert.equal(report.reviewInputOnly,true);assert.equal(report.authorizesPromotion,false);assert.equal(report.thresholdRecommendation,null);
  assert.equal(report.metrics.assessmentAccuracy,1);assert.equal(report.metrics.rootCauseTop1Accuracy,1);assert.equal(report.metrics.insufficientEvidenceAccuracy,1);
  assert.deepEqual(report.review.assessmentMisses,[]);assert.deepEqual(report.review.rootCauseMisses,[]);assert.deepEqual(report.review.insufficientMisses,[]);assert.deepEqual(report.review.falseFixCases,[]);
  assert.deepEqual(report.review.tokenDistribution,{cases:15,totalTokens:240,meanTokensPerCase:16,p50TokensPerCase:16,p95TokensPerCase:30,maxTokensPerCase:30});
  assert.equal(report.review.patch.accepted,0);assert.equal(report.review.patch.none,15);
  assert.equal(report.review.lineage.length,2);assert.ok(report.review.lineage.every(x=>x.cases===15));
  assert.equal(report.admission.ready,false);assert.ok(report.admission.gaps.includes('promotion admission policy is not reviewed'));
  assert.match(report.digest,/^[0-9a-f]{64}$/);
});

test('calibration report self digest rejects post-generation tampering',()=>{
  const {qualification,modelRecord,admission}=fixture(),report=JSON.parse(JSON.stringify(buildCalibrationReport({policy,reviewedCorpus:corpus,qualification,modelRecord,admission,recordedAt:'2026-09-07T00:03:00.000Z'})));
  report.review.tokenDistribution.maxTokensPerCase=999999;
  assert.throws(()=>validateCalibrationReport(report),/self digest mismatch/);
});

test('promotion workflow creates calibration report only after admission receipt revalidation and retains it',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','promotion-model-eval.yml'),'utf8'),revalidate=workflow.indexOf('Re-validate promotion admission receipt'),report=workflow.indexOf('Build calibration review report');
  assert.ok(revalidate>0&&report>revalidate);
  assert.match(workflow,/promotion-calibration-report\.js/);assert.match(workflow,/PROMOTION_CALIBRATION_REPORT\.json/);
  assert.match(workflow,/permissions:\s*\n\s+contents:\s*read\b/);assert.doesNotMatch(workflow,/\bcontents:\s*write\b/i);assert.doesNotMatch(workflow,/\bgit\s+push\b/i);
});
