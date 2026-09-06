'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const corpus=require('../quality/model-eval-contract-corpus.json');
const record=require('../quality/model-eval-contract-results.json');
const {stableDigest,validateCorpus,validateRecord,evaluate}=require('../scripts/model-evaluation');

function clone(value){return JSON.parse(JSON.stringify(value));}
function resign(value){const copy={...value};delete copy.recordDigest;value.recordDigest=stableDigest(copy);return value;}

test('contract fixture evaluates perfectly without becoming a live metric',()=>{
  const result=evaluate(corpus,record);
  assert.equal(result.assessmentAccuracy,1);
  assert.equal(result.rootCauseTop1Accuracy,1);
  assert.equal(result.insufficientEvidenceAccuracy,1);
  assert.equal(result.falseSupport,0);
  assert.equal(result.falseFixCandidates,0);
  assert.equal(result.patchPolicyViolations,0);
  assert.equal(result.claimableLiveMetric,false);
});

test('corpus expectation tampering fails before evaluation',()=>{
  const changed=clone(corpus);
  changed.cases[0].expected.assessment='contradicted';
  assert.throws(()=>validateCorpus(changed),/expectation digest mismatch/);
});

test('record tampering is detected by the self digest',()=>{
  const changed=clone(record);
  changed.cases[0].judgment.causalAssessment='insufficient';
  assert.throws(()=>validateRecord(corpus,changed),/record digest mismatch/);
});

test('contract fixture cannot satisfy a live-evidence requirement',()=>{
  assert.throws(()=>evaluate(corpus,record,{requireLive:true}),/live model evidence is required/);
});

test('promotion eligibility requires both live source and promotion corpus',()=>{
  const changed=clone(record);changed.source='live';changed.promotionEligible=true;resign(changed);
  assert.throws(()=>validateRecord(corpus,changed),/promotion evidence requires a promotion corpus/);
});

test('forbidden accepted or non-applicable patch is counted as false-fix evidence',()=>{
  const changed=clone(record);
  const item=changed.cases.find(x=>x.caseId==='insufficient-external-500');
  item.judgment.patchProposed=true;item.judgment.patchDisposition='accept';item.judgment.patchApplicable=false;
  item.judgment.rootCauseDigest=stableDigest(item.judgment.rootCauseText);resign(changed);
  const result=evaluate(corpus,changed);
  assert.equal(result.falseFixCandidates,1);
  assert.equal(result.patchPolicyViolations,1);
});
