'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const corpus=require('../quality/promotion-corpus.json');
const {stableDigest}=require('../scripts/model-evaluation');
const {validatePromotionCorpus,promotionReadiness}=require('../scripts/promotion-corpus');
const {modelEvidenceForCase,assertProjectedEvidenceBoundary}=require('../scripts/promotion-live-eval');

function clone(value){return JSON.parse(JSON.stringify(value));}
function projectedCase(){
  const expected={assessment:'insufficient',rootCauseTerms:[],patchPolicy:'forbidden'};
  const projection={version:1,mode:'summary-only'};
  const groundTruth={type:'fix-commit',commit:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',files:['src/hidden-root-cause.js'],summary:'A hidden reviewed fix proves the causal mechanism, but that mechanism is intentionally unavailable in the model-visible projection.'};
  return {id:'projected-insufficient-fixture',mode:'historical-projected',relation:'direct-parent-fix',repository:'https://github.com/example/projection-fixture.git',anchorRef:'refs/pull/1/head',badCommit:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',fixedCommit:groundTruth.commit,failureKind:'unknown',reproduction:{command:'node repro.js',runs:2,timeoutMs:30000},expected,expectationDigest:stableDigest(expected),evidenceProjection:projection,evidenceProjectionDigest:stableDigest(projection),groundTruth,groundTruthDigest:stableDigest(groundTruth)};
}
function withProjectedCase(){const value=clone(corpus);value.cases.push(projectedCase());return value;}

test('promotion corpus v2 accepts a real-transition projected insufficient case without making current corpus eligible',()=>{
  assert.equal(corpus.schemaVersion,2);
  validatePromotionCorpus(corpus);
  const value=withProjectedCase();
  validatePromotionCorpus(value);
  const readiness=promotionReadiness(value);
  assert.equal(readiness.insufficientCases,1);
  assert.equal(readiness.ready,false);
});

test('insufficient assessment cannot masquerade as full observed evidence',()=>{
  const value=withProjectedCase(),item=value.cases.at(-1);
  item.mode='historical-observed';delete item.evidenceProjection;delete item.evidenceProjectionDigest;
  assert.throws(()=>validatePromotionCorpus(value),/must use historical-projected evidence/);
});

test('projected insufficient cases must forbid patches and root-cause terms',()=>{
  const patch=withProjectedCase(),patchItem=patch.cases.at(-1);patchItem.expected.patchPolicy='optional';patchItem.expectationDigest=stableDigest(patchItem.expected);
  assert.throws(()=>validatePromotionCorpus(patch),/must forbid patches/);
  const terms=withProjectedCase(),termsItem=terms.cases.at(-1);termsItem.expected.rootCauseTerms=['hidden cause'];termsItem.expectationDigest=stableDigest(termsItem.expected);
  assert.throws(()=>validatePromotionCorpus(terms),/must not disclose root-cause terms/);
});

test('projection surface is fixed and digest-bound',()=>{
  const extra=withProjectedCase(),extraItem=extra.cases.at(-1);extraItem.evidenceProjection.customText='the answer is hidden here';extraItem.evidenceProjectionDigest=stableDigest(extraItem.evidenceProjection);
  assert.throws(()=>validatePromotionCorpus(extra),/projection surface must remain fixed/);
  const tampered=withProjectedCase(),tamperedItem=tampered.cases.at(-1);tamperedItem.evidenceProjectionDigest='0'.repeat(64);
  assert.throws(()=>validatePromotionCorpus(tampered),/evidence projection digest mismatch/);
});

test('summary-only projection omits raw output, case identity, reviewed fix and ground truth',()=>{
  const item=projectedCase();
  const observed={summary:{runs:2,failures:2,timeouts:0},representative:{stdout:'RAW_STDOUT_SECRET_CAUSE src/hidden-root-cause.js',stderr:`RAW_STDERR_FIXED_${item.fixedCommit}`}};
  const visible=modelEvidenceForCase(item,observed);
  assert.equal(visible.sourceType,'historical-projected');
  assert.equal(visible.sourceLabel,'reviewed historical projected evidence');
  assert.equal(visible.includeGitHistory,false);
  for(const forbidden of ['RAW_STDOUT_SECRET_CAUSE','RAW_STDERR_FIXED_',item.id,item.fixedCommit,item.groundTruth.summary,'src/hidden-root-cause.js'])assert.doesNotMatch(visible.text,new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
  assert.match(visible.text,/Observed runs: 2; failures: 2; timeouts: 0/);
  assert.match(visible.text,/Raw stdout\/stderr, source anchors, Git history, case identity, and the reviewed fix are unavailable/i);
  assert.doesNotThrow(()=>assertProjectedEvidenceBoundary(item,visible));
});

test('projected evidence boundary rejects later leakage or Git-history re-enablement',()=>{
  const item=projectedCase(),observed={summary:{runs:1,failures:1,timeouts:0},representative:{stdout:'',stderr:''}},visible=modelEvidenceForCase(item,observed);
  assert.throws(()=>assertProjectedEvidenceBoundary(item,{...visible,text:`${visible.text}\n${item.fixedCommit}`}),/leaks reviewed ground truth/);
  assert.throws(()=>assertProjectedEvidenceBoundary(item,{...visible,includeGitHistory:true}),/must disable Git history/);
});

test('observed historical cases retain representative output and Git history',()=>{
  const item=corpus.cases[0],observed={summary:{runs:1,failures:1,timeouts:0},representative:{stdout:'OBSERVED_STDOUT',stderr:'OBSERVED_STDERR'}};
  const visible=modelEvidenceForCase(item,observed);
  assert.equal(visible.sourceType,'historical-observed');
  assert.equal(visible.includeGitHistory,true);
  assert.match(visible.text,/OBSERVED_STDOUT/);
  assert.match(visible.text,/OBSERVED_STDERR/);
});
