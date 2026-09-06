#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {stableDigest}=require('./model-evaluation');

const VERSION=2;
const PROJECTION_VERSION=1;
const SHA40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
const REPO=/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/;
const ANCHOR=/^refs\/(?:pull\/\d+\/head|heads\/[A-Za-z0-9._\/-]+|tags\/[A-Za-z0-9._\/-]+)$/;
const KINDS=new Set(['build','test','crash','sanitizer','race','deadlock','oom','watchdog','kernel','android','mcu','audio','performance','dependency','infra','unknown']);
const MODES=new Set(['historical-observed','historical-projected']);
const ASSESSMENTS=new Set(['supported','insufficient','contradicted']);
const PATCH_POLICIES=new Set(['required','optional','forbidden']);

function safeRel(value){const p=String(value||'').replace(/\\/g,'/');return Boolean(p)&&!p.startsWith('/')&&!p.split('/').includes('..')&&!p.startsWith('.git/')&&!p.startsWith('.codex-debug/');}
function validatePolicy(policy={}){for(const key of ['minimumCases','minimumRepositories','minimumFailureKinds','minimumInsufficientCases'])assert.ok(Number.isInteger(policy[key])&&policy[key]>=1&&policy[key]<=1000,`invalid promotion policy ${key}`);return policy;}
function validateProjection(item,expected){
  if(item.mode==='historical-observed'){
    assert.notEqual(expected.assessment,'insufficient',`insufficient case ${item.id} must use historical-projected evidence`);
    assert.equal(item.evidenceProjection,undefined,`observed case ${item.id} must not define evidenceProjection`);
    assert.equal(item.evidenceProjectionDigest,undefined,`observed case ${item.id} must not define evidenceProjectionDigest`);
    return;
  }
  assert.equal(item.mode,'historical-projected',`unsupported promotion evidence mode for ${item.id}`);
  assert.equal(expected.assessment,'insufficient',`projected case ${item.id} must expect insufficient assessment`);
  assert.equal(expected.patchPolicy,'forbidden',`projected case ${item.id} must forbid patches`);
  assert.deepEqual(expected.rootCauseTerms,[],`projected case ${item.id} must not disclose root-cause terms`);
  const projection=item.evidenceProjection||{};
  assert.deepEqual(Object.keys(projection).sort(),['mode','version'],`projected case ${item.id} projection surface must remain fixed`);
  assert.equal(projection.version,PROJECTION_VERSION,`projected case ${item.id} projection version mismatch`);
  assert.equal(projection.mode,'summary-only',`projected case ${item.id} must use summary-only projection`);
  assert.match(String(item.evidenceProjectionDigest||''),HEX64,`invalid evidenceProjectionDigest for ${item.id}`);
  assert.equal(item.evidenceProjectionDigest,stableDigest(projection),`evidence projection digest mismatch for ${item.id}`);
}
function validatePromotionCorpus(corpus){
  assert.equal(corpus?.schemaVersion,VERSION,'promotion corpus schema mismatch');
  assert.equal(corpus?.kind,'codex-debug-promotion-corpus','promotion corpus kind mismatch');
  assert.equal(typeof corpus?.promotionEligible,'boolean','promotionEligible must be explicit');
  assert.ok(String(corpus?.provenance||''),'promotion corpus provenance is required');
  validatePolicy(corpus.policy||{});
  assert.ok(Array.isArray(corpus?.cases)&&corpus.cases.length>0,'promotion corpus requires at least one reviewed case');
  const ids=new Set(),transitions=new Set(),badCommits=new Set(),fixedCommits=new Set();
  for(const item of corpus.cases){
    assert.match(String(item.id||''),/^[a-z0-9][a-z0-9._-]{2,119}$/,'invalid promotion case id');
    assert.ok(!ids.has(item.id),`duplicate promotion case ${item.id}`);ids.add(item.id);
    assert.ok(MODES.has(item.mode),`invalid promotion mode for ${item.id}`);
    assert.equal(item.relation,'direct-parent-fix',`promotion case ${item.id} must bind a direct-parent fix`);
    assert.match(String(item.repository||''),REPO,`promotion case ${item.id} must use a reviewed public GitHub repository URL`);
    assert.match(String(item.anchorRef||''),ANCHOR,`promotion case ${item.id} requires a reviewed fetch anchor`);
    assert.ok(!String(item.anchorRef).includes('..'),`unsafe fetch anchor for ${item.id}`);
    assert.match(String(item.badCommit||''),SHA40,`invalid badCommit for ${item.id}`);
    assert.match(String(item.fixedCommit||''),SHA40,`invalid fixedCommit for ${item.id}`);
    assert.notEqual(item.badCommit,item.fixedCommit,`bad/fixed commits must differ for ${item.id}`);
    const transitionKey=`${item.repository}\n${item.badCommit}\n${item.fixedCommit}`;
    assert.ok(!transitions.has(transitionKey),`duplicate historical transition for ${item.id}`);transitions.add(transitionKey);
    assert.ok(!badCommits.has(item.badCommit),`duplicate badCommit across promotion cases: ${item.badCommit}`);badCommits.add(item.badCommit);
    assert.ok(!fixedCommits.has(item.fixedCommit),`duplicate fixedCommit across promotion cases: ${item.fixedCommit}`);fixedCommits.add(item.fixedCommit);
    assert.ok(KINDS.has(item.failureKind),`invalid failureKind for ${item.id}`);
    const repro=item.reproduction||{};
    assert.ok(String(repro.command||'').length>=1&&String(repro.command).length<=1000&&!/[\0\r\n]/.test(repro.command),`invalid reproduction command for ${item.id}`);
    assert.ok(Number.isInteger(repro.runs)&&repro.runs>=1&&repro.runs<=5,`invalid reproduction runs for ${item.id}`);
    assert.ok(Number.isInteger(repro.timeoutMs)&&repro.timeoutMs>=1000&&repro.timeoutMs<=600000,`invalid reproduction timeout for ${item.id}`);
    const expected=item.expected||{};
    assert.ok(ASSESSMENTS.has(expected.assessment),`invalid expected assessment for ${item.id}`);
    assert.ok(PATCH_POLICIES.has(expected.patchPolicy),`invalid patch policy for ${item.id}`);
    assert.ok(Array.isArray(expected.rootCauseTerms),`rootCauseTerms must be an array for ${item.id}`);
    assert.equal(item.expectationDigest,stableDigest(expected),`expectation digest mismatch for ${item.id}`);
    validateProjection(item,expected);
    const truth=item.groundTruth||{};
    assert.equal(truth.type,'fix-commit',`ground truth for ${item.id} must be fix-commit`);
    assert.equal(truth.commit,item.fixedCommit,`ground-truth commit must equal fixedCommit for ${item.id}`);
    assert.ok(Array.isArray(truth.files)&&truth.files.length>=1&&truth.files.length<=20,`ground-truth files required for ${item.id}`);
    for(const file of truth.files)assert.ok(safeRel(file),`unsafe ground-truth file for ${item.id}: ${file}`);
    assert.ok(String(truth.summary||'').length>=20&&String(truth.summary).length<=2000,`ground-truth summary required for ${item.id}`);
    assert.match(String(item.groundTruthDigest||''),HEX64,`invalid groundTruthDigest for ${item.id}`);
    assert.equal(item.groundTruthDigest,stableDigest(truth),`ground-truth digest mismatch for ${item.id}`);
  }
  const readiness=promotionReadiness(corpus);
  if(corpus.promotionEligible)assert.equal(readiness.ready,true,`promotionEligible cannot be true: ${readiness.gaps.join('; ')}`);
  return corpus;
}
function promotionReadiness(corpus){
  const policy=corpus.policy||{},cases=Array.isArray(corpus.cases)?corpus.cases:[];
  const repositories=new Set(cases.map(x=>x.repository));
  const kinds=new Set(cases.map(x=>x.failureKind));
  const insufficient=cases.filter(x=>x.mode==='historical-projected'&&x.expected?.assessment==='insufficient').length;
  const gaps=[];
  if(cases.length<policy.minimumCases)gaps.push(`cases ${cases.length}/${policy.minimumCases}`);
  if(repositories.size<policy.minimumRepositories)gaps.push(`repositories ${repositories.size}/${policy.minimumRepositories}`);
  if(kinds.size<policy.minimumFailureKinds)gaps.push(`failureKinds ${kinds.size}/${policy.minimumFailureKinds}`);
  if(insufficient<policy.minimumInsufficientCases)gaps.push(`insufficientCases ${insufficient}/${policy.minimumInsufficientCases}`);
  return Object.freeze({ready:gaps.length===0,cases:cases.length,repositories:repositories.size,failureKinds:kinds.size,insufficientCases:insufficient,gaps});
}
function toEvaluationCorpus(corpus){validatePromotionCorpus(corpus);return Object.freeze({schemaVersion:1,kind:'codex-debug-model-eval-corpus',promotionEligible:Boolean(corpus.promotionEligible&&promotionReadiness(corpus).ready),provenance:`promotion:${corpus.provenance}`,cases:corpus.cases.map(item=>({id:item.id,expected:item.expected,expectationDigest:item.expectationDigest}))});}
function main(){const file=process.argv[2]||path.join(__dirname,'..','quality','promotion-corpus.json'),corpus=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));validatePromotionCorpus(corpus);const readiness=promotionReadiness(corpus);process.stdout.write(`${JSON.stringify({schemaVersion:VERSION,promotionEligible:corpus.promotionEligible,readyForPromotion:readiness.ready,...readiness,corpusDigest:stableDigest(corpus)})}\n`);}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={VERSION,PROJECTION_VERSION,validateProjection,validatePromotionCorpus,promotionReadiness,toEvaluationCorpus};
