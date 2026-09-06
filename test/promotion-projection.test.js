'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const corpus=require('../quality/promotion-corpus.json');
const {stableDigest}=require('../scripts/model-evaluation');
const {validatePromotionCorpus,promotionReadiness,toEvaluationCorpus}=require('../scripts/promotion-corpus');
const {projectedEvidence,assertProjectedEvidenceBoundary,observedEvidence}=require('../scripts/promotion-live-eval');

function clone(value){return JSON.parse(JSON.stringify(value));}
function variantCases(value=corpus){return value.cases.filter(x=>x.insufficientVariant);}
function firstVariant(value){return value.cases.find(x=>x.insufficientVariant);}

test('current reviewed corpus has three authentic insufficient variants without duplicating transitions',()=>{assert.equal(corpus.schemaVersion,2);validatePromotionCorpus(corpus);const readiness=promotionReadiness(corpus);assert.deepEqual(readiness,{ready:false,cases:6,repositories:4,failureKinds:4,insufficientCases:3,gaps:['cases 6/12']});assert.equal(variantCases().length,3);const evalCorpus=toEvaluationCorpus(corpus);assert.equal(evalCorpus.cases.length,9);for(const item of variantCases())assert.ok(evalCorpus.cases.some(x=>x.id===item.insufficientVariant.id));});

test('full reviewed transitions cannot be relabeled insufficient',()=>{const value=clone(corpus),item=value.cases[0];item.expected={assessment:'insufficient',rootCauseTerms:[],patchPolicy:'forbidden'};item.expectationDigest=stableDigest(item.expected);assert.throws(()=>validatePromotionCorpus(value),/cannot use insufficient/);});

test('insufficient variants must forbid patches and root-cause terms',()=>{const patch=clone(corpus),p=firstVariant(patch);p.insufficientVariant.expected.patchPolicy='optional';p.insufficientVariant.expectationDigest=stableDigest(p.insufficientVariant.expected);assert.throws(()=>validatePromotionCorpus(patch),/must forbid patches/);const terms=clone(corpus),t=firstVariant(terms);t.insufficientVariant.expected.rootCauseTerms=['hidden cause'];t.insufficientVariant.expectationDigest=stableDigest(t.insufficientVariant.expected);assert.throws(()=>validatePromotionCorpus(terms),/must not disclose root-cause terms/);});

test('variant and projection surfaces are fixed and digest-bound',()=>{const extra=clone(corpus),e=firstVariant(extra);e.insufficientVariant.custom='x';assert.throws(()=>validatePromotionCorpus(extra),/variant surface must remain fixed/);const projected=clone(corpus),p=firstVariant(projected);p.insufficientVariant.evidenceProjection.customText='the answer';p.insufficientVariant.evidenceProjectionDigest=stableDigest(p.insufficientVariant.evidenceProjection);assert.throws(()=>validatePromotionCorpus(projected),/projection surface must remain fixed/);const tampered=clone(corpus),t=firstVariant(tampered);t.insufficientVariant.evidenceProjectionDigest='0'.repeat(64);assert.throws(()=>validatePromotionCorpus(tampered),/evidence projection digest mismatch/);});

test('removing variants changes only insufficient readiness, not reviewed case diversity',()=>{const value=clone(corpus);for(const item of value.cases)delete item.insufficientVariant;validatePromotionCorpus(value);const ready=promotionReadiness(value);assert.deepEqual(ready,{ready:false,cases:6,repositories:4,failureKinds:4,insufficientCases:0,gaps:['cases 6/12','insufficientCases 0/3']});});

test('summary-only projection omits raw output, ids, reviewed fix and ground truth for every real variant',()=>{for(const item of variantCases()){const observed={summary:{runs:2,failures:2,timeouts:0},representative:{stdout:`RAW_STDOUT ${item.groundTruth.files[0]}`,stderr:`RAW_STDERR ${item.fixedCommit}`}},visible=projectedEvidence(item,observed);assert.equal(visible.sourceType,'historical-projected');assert.equal(visible.includeGitHistory,false);for(const forbidden of ['RAW_STDOUT','RAW_STDERR',item.id,item.insufficientVariant.id,item.fixedCommit,item.groundTruth.summary,...item.groundTruth.files])assert.doesNotMatch(visible.text,new RegExp(String(forbidden).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));assert.match(visible.text,/Observed runs: 2; failures: 2; timeouts: 0/);assert.doesNotThrow(()=>assertProjectedEvidenceBoundary(item,visible));}});

test('projected evidence boundary rejects later leakage or Git-history re-enablement',()=>{const item=variantCases()[0],observed={summary:{runs:1,failures:1,timeouts:0},representative:{stdout:'',stderr:''}},visible=projectedEvidence(item,observed);assert.throws(()=>assertProjectedEvidenceBoundary(item,{...visible,text:`${visible.text}\n${item.fixedCommit}`}),/leaks reviewed ground truth/);assert.throws(()=>assertProjectedEvidenceBoundary(item,{...visible,includeGitHistory:true}),/must disable Git history/);});

test('observed historical cases retain representative output and Git history',()=>{const item=corpus.cases[0],observed={summary:{runs:1,failures:1,timeouts:0},representative:{stdout:'OBSERVED_STDOUT',stderr:'OBSERVED_STDERR'}},visible=observedEvidence(item,observed);assert.equal(visible.sourceType,'historical-observed');assert.equal(visible.includeGitHistory,true);assert.match(visible.text,/OBSERVED_STDOUT/);assert.match(visible.text,/OBSERVED_STDERR/);});
