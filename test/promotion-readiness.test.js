'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const corpus=require('../quality/promotion-corpus.json');
const policy=require('../quality/promotion-admission-policy.json');
const governanceLock=require('../quality/promotion-repository-governance-lock.json');
const productContract=require('../product-contract.json');
const pkg=require('../package.json');
const {stableDigest}=require('../scripts/model-evaluation');
const {promotionReadiness}=require('../scripts/promotion-corpus');
const {buildReadinessReceipt}=require('../scripts/promotion-readiness');

const root=path.resolve(__dirname,'..');
function git(args){return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function syntheticQualification(){
  const debugCommit=git(['rev-parse','HEAD']),coreCommit=git(['ls-files','--stage','src/codex-safe-core']).split(/\s+/)[1];
  const record={schemaVersion:1,kind:'codex-debug-promotion-corpus-qualification',recordedAt:'2026-09-08T00:00:00.000Z',debugCommit,coreCommit,corpusDigest:stableDigest(corpus),readiness:promotionReadiness(corpus),runContext:{workflow:'fixture',runId:'1',runAttempt:'1',event:'workflow_dispatch',repository:'jiying2007/codex-debug',sourceSha:debugCommit},cases:corpus.cases.map(spec=>({caseId:spec.id,repository:spec.repository,anchorRef:spec.anchorRef,badCommit:spec.badCommit,fixedCommit:spec.fixedCommit,commandDigest:stableDigest(spec.reproduction.command),badRepresentativeDigest:'a'.repeat(64),fixedRepresentativeDigest:'b'.repeat(64),transitionDigest:'c'.repeat(64),badSummary:{reproducibleFailure:true,failures:1},fixedSummary:{failures:0}}))};
  record.digest=stableDigest(record);return record;
}

test('checked-in development state stays fail-closed without Qualification',()=>{
  const receipt=buildReadinessReceipt({qualification:null});
  assert.equal(receipt.deterministicReady,false);
  assert.deepEqual(receipt.deterministicBlockers,['qualification-missing']);
  for(const blocker of ['live-model-calibration-missing','admission-policy-unreviewed','token-policy-uncalibrated','governance-lock-unreviewed','promotion-eligibility-unreviewed','lifecycle-not-active','immutable-releases-platform-unverified'])assert.ok(receipt.externalAuthorityBlockers.includes(blocker));
  assert.equal(receipt.promotionAuthorized,false);
  assert.match(receipt.receiptDigest,/^[0-9a-f]{64}$/);
});

test('current exact Qualification closes deterministic work but never grants external authority',()=>{
  const qualification=syntheticQualification(),receipt=buildReadinessReceipt({qualification});
  assert.equal(receipt.qualification.valid,true);
  assert.equal(receipt.qualification.digest,qualification.digest);
  assert.equal(receipt.deterministicReady,true);
  assert.deepEqual(receipt.deterministicBlockers,[]);
  assert.equal(receipt.readyForPromotionAuthorityReview,true);
  assert.equal(receipt.promotionAuthorized,false);
  assert.ok(receipt.externalAuthorityBlockers.length>=1);
});

test('stale Qualification is rejected as deterministic evidence for current HEAD',()=>{
  const qualification=syntheticQualification();qualification.debugCommit='0'.repeat(40);qualification.runContext.sourceSha=qualification.debugCommit;
  const copy={...qualification};delete copy.digest;qualification.digest=stableDigest(copy);
  const receipt=buildReadinessReceipt({qualification});
  assert.equal(receipt.deterministicReady,false);
  assert.ok(receipt.deterministicBlockers.includes('qualification-not-bound-to-current-head'));
});

test('readiness receipt never infers provider/API availability',()=>{
  const receipt=buildReadinessReceipt({qualification:syntheticQualification(),reviewedCorpus:corpus,admissionPolicy:policy,repositoryGovernanceLock:governanceLock,contract:productContract,packageManifest:pkg});
  const json=JSON.stringify(receipt);
  assert.doesNotMatch(json,/api[_-]?key|provider[_-]?base|secret/i);
});
