'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const corpus=require('../quality/promotion-corpus.json');
const draftPolicy=require('../quality/promotion-admission-policy.json');
const {stableDigest}=require('../scripts/model-evaluation');
const {toEvaluationCorpus}=require('../scripts/promotion-corpus');
const {validateAdmissionPolicy}=require('../scripts/promotion-admission');
const {buildReviewedPolicy}=require('../scripts/promotion-policy-review');

function report(overrides={}){
  const debugCommit='a'.repeat(40),coreCommit='b'.repeat(40),value={
    schemaVersion:1,
    kind:'codex-debug-promotion-calibration-report',
    recordedAt:'2026-09-07T00:03:00.000Z',
    reviewInputOnly:true,
    authorizesPromotion:false,
    thresholdRecommendation:null,
    debugCommit,
    coreCommit,
    corpusDigest:stableDigest(corpus),
    evaluationCorpusDigest:stableDigest(toEvaluationCorpus(corpus)),
    policyDigest:'c'.repeat(64),
    qualificationDigest:'d'.repeat(64),
    modelRecordDigest:'e'.repeat(64),
    admissionDigest:'f'.repeat(64),
    runContext:{workflow:'Promotion Model Evaluation',runId:'88',runAttempt:'1',event:'workflow_dispatch',repository:'jiying2007/codex-debug',sourceSha:debugCommit},
    admission:{ready:false,gaps:['promotion admission policy is not reviewed']},
    metrics:{assessmentAccuracy:0.9,rootCauseTop1Accuracy:0.8,insufficientEvidenceAccuracy:1,falseSupport:0,falseFixCandidates:0,patchPolicyViolations:0},
    review:{assessmentMisses:[],rootCauseMisses:[],insufficientMisses:[],falseFixCases:[],patch:{proposed:0,accepted:0,rejected:0,none:15,acceptedApplicable:0,acceptedNonApplicable:0,acceptedApplicabilityUnknown:0},tokenDistribution:{cases:15,totalTokens:1500,meanTokensPerCase:100,p50TokensPerCase:90,p95TokensPerCase:140,maxTokensPerCase:160},lineage:[]},
    cases:[]
  };
  Object.assign(value,overrides);
  delete value.digest;value.digest=stableDigest(value);return value;
}

function build(r=report(),extra={}){return buildReviewedPolicy({report:r,minimumAssessmentAccuracy:0.85,minimumRootCauseTop1Accuracy:0.75,maximumTokensPerCase:120,basePolicy:draftPolicy,reviewedCorpus:corpus,expectedCoreCommit:'b'.repeat(40),...extra});}

test('policy review generator derives calibration provenance from a validated report without recommending thresholds',()=>{
  const r=report(),candidate=build(r);
  validateAdmissionPolicy(candidate);
  assert.equal(candidate.reviewed,true);
  assert.equal(candidate.calibrationEvidence.reportDigest,r.digest);
  assert.equal(candidate.calibrationEvidence.debugCommit,r.debugCommit);
  assert.equal(candidate.calibrationEvidence.coreCommit,r.coreCommit);
  assert.deepEqual(candidate.calibrationEvidence.runContext,r.runContext);
  assert.equal(candidate.quality.minimumAssessmentAccuracy,0.85);
  assert.equal(candidate.quality.minimumRootCauseTop1Accuracy,0.75);
  assert.equal(candidate.quality.minimumInsufficientEvidenceAccuracy,1);
  assert.deepEqual(candidate.safety,{maximumFalseSupport:0,maximumFalseFixCandidates:0,maximumPatchPolicyViolations:0});
  assert.deepEqual(candidate.tokenEfficiency,{calibrated:true,maximumTokensPerCase:120});
  assert.match(candidate.policyDigest,/^[0-9a-f]{64}$/);
});

test('policy review generator rejects stale Core or corpus calibration',()=>{
  assert.throws(()=>build(report(),{expectedCoreCommit:'9'.repeat(40)}),/stale for the current Safe Core gitlink/);
  const stale=report({corpusDigest:'1'.repeat(64)});
  assert.throws(()=>build(stale),/stale for the reviewed corpus/);
});

test('policy review generator rejects thresholds unsupported by calibration and never weakens fixed safety floors',()=>{
  assert.throws(()=>build(report(),{minimumAssessmentAccuracy:0.91}),/assessment threshold exceeds observed calibration accuracy/);
  assert.throws(()=>build(report(),{minimumRootCauseTop1Accuracy:0.81}),/root-cause threshold exceeds observed calibration accuracy/);
  assert.throws(()=>build(report(),{maximumTokensPerCase:99}),/token ceiling is below observed calibration mean/);
  const unsafe=report();unsafe.metrics.falseFixCandidates=1;delete unsafe.digest;unsafe.digest=stableDigest(unsafe);
  assert.throws(()=>build(unsafe),/false-fix candidates/);
  const weak=report();weak.metrics.insufficientEvidenceAccuracy=0.9;delete weak.digest;weak.digest=stableDigest(weak);
  assert.throws(()=>build(weak),/fixed insufficient-evidence floor/);
});

test('policy review generator refuses a tampered calibration report even when its provenance fields look plausible',()=>{
  const r=report();r.review.tokenDistribution.meanTokensPerCase=1;
  assert.throws(()=>build(r),/self digest mismatch/);
});
