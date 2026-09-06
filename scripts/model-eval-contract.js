#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const corpus=require('../quality/model-eval-contract-corpus.json');
const record=require('../quality/model-eval-contract-results.json');
const {evaluate}=require('./model-evaluation');
function main(){
  const result=evaluate(corpus,record);
  assert.equal(result.source,'contract-fixture');
  assert.equal(result.promotionEligible,false);
  assert.equal(result.claimableLiveMetric,false);
  assert.equal(result.assessmentAccuracy,1);
  assert.equal(result.rootCauseTop1Accuracy,1);
  assert.equal(result.insufficientEvidenceAccuracy,1);
  assert.equal(result.falseSupport,0);
  assert.equal(result.falseFixCandidates,0);
  assert.equal(result.patchPolicyViolations,0);
  assert.equal(result.usage.totalTokens,477);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
