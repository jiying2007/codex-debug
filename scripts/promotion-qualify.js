#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const corpus=require('../quality/promotion-corpus.json');
const {stableDigest}=require('./model-evaluation');
const {validatePromotionCorpus,promotionReadiness}=require('./promotion-corpus');
const {materializeHistoricalCase}=require('./historical-case');

const SHA40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
function head(root){return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function core(root){return execFileSync('git',['ls-files','--stage','src/codex-safe-core'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split(/\s+/)[1];}
function parseArgs(argv){const out={output:'PROMOTION_CORPUS_QUALIFICATION.json'};for(let i=0;i<argv.length;i++){if(argv[i]==='--output')out.output=argv[++i];else throw new Error(`Unknown argument: ${argv[i]}`);}return out;}
function runContext(){return {workflow:String(process.env.GITHUB_WORKFLOW||''),runId:String(process.env.GITHUB_RUN_ID||''),runAttempt:String(process.env.GITHUB_RUN_ATTEMPT||''),event:String(process.env.GITHUB_EVENT_NAME||''),repository:String(process.env.GITHUB_REPOSITORY||''),sourceSha:String(process.env.GITHUB_SHA||'')};}
function validateQualificationRecord(record,reviewedCorpus=corpus){
  validatePromotionCorpus(reviewedCorpus);
  assert.equal(record?.schemaVersion,1,'qualification schema mismatch');
  assert.equal(record?.kind,'codex-debug-promotion-corpus-qualification','qualification kind mismatch');
  assert.match(String(record?.debugCommit||''),SHA40,'invalid qualification debugCommit');
  assert.match(String(record?.coreCommit||''),SHA40,'invalid qualification coreCommit');
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(String(record?.recordedAt||'')),'qualification recordedAt must be canonical UTC');
  assert.equal(new Date(record.recordedAt).toISOString(),record.recordedAt,'qualification recordedAt must round-trip canonically');
  assert.equal(record.corpusDigest,stableDigest(reviewedCorpus),'qualification corpus digest mismatch');
  assert.deepEqual(record.readiness,promotionReadiness(reviewedCorpus),'qualification readiness mismatch');
  assert.ok(Array.isArray(record.cases),'qualification cases must be an array');
  const expectedIds=reviewedCorpus.cases.map(x=>x.id).sort(),actualIds=record.cases.map(x=>x.caseId).sort();
  assert.deepEqual(actualIds,expectedIds,'qualification case set mismatch');
  const specs=new Map(reviewedCorpus.cases.map(x=>[x.id,x]));
  for(const item of record.cases){
    const spec=specs.get(item.caseId);assert.ok(spec,`unknown qualification case ${item.caseId}`);
    assert.equal(item.repository,spec.repository,`qualification repository mismatch for ${item.caseId}`);
    assert.equal(item.anchorRef,spec.anchorRef,`qualification anchor mismatch for ${item.caseId}`);
    assert.equal(item.badCommit,spec.badCommit,`qualification badCommit mismatch for ${item.caseId}`);
    assert.equal(item.fixedCommit,spec.fixedCommit,`qualification fixedCommit mismatch for ${item.caseId}`);
    for(const key of ['commandDigest','badRepresentativeDigest','fixedRepresentativeDigest','transitionDigest'])assert.match(String(item[key]||''),HEX64,`invalid ${key} for ${item.caseId}`);
    assert.equal(item.commandDigest,stableDigest(spec.reproduction.command),`qualification command digest mismatch for ${item.caseId}`);
    assert.equal(item.badSummary?.reproducibleFailure,true,`qualification bad failure not reproducible for ${item.caseId}`);
    assert.ok(Number(item.badSummary?.failures)>=1,`qualification bad failure count missing for ${item.caseId}`);
    assert.equal(Number(item.fixedSummary?.failures),0,`qualification fixed commit still fails for ${item.caseId}`);
  }
  const copy={...record};delete copy.digest;
  assert.match(String(record.digest||''),HEX64,'invalid qualification digest');
  assert.equal(record.digest,stableDigest(copy),'qualification self digest mismatch');
  if(record.runContext?.sourceSha){
    assert.match(record.runContext.sourceSha,SHA40,'invalid qualification runContext sourceSha');
    assert.equal(record.runContext.sourceSha,record.debugCommit,'qualification Actions sourceSha must equal debugCommit');
  }
  return record;
}
function main(){
  const args=parseArgs(process.argv.slice(2));
  validatePromotionCorpus(corpus);
  const transitions=[];
  for(const item of corpus.cases){const materialized=materializeHistoricalCase(item);try{transitions.push(materialized.transition);}finally{materialized.cleanup();}}
  const root=path.resolve(__dirname,'..'),record={schemaVersion:1,kind:'codex-debug-promotion-corpus-qualification',recordedAt:new Date().toISOString(),debugCommit:head(root),coreCommit:core(root),corpusDigest:stableDigest(corpus),readiness:promotionReadiness(corpus),runContext:runContext(),cases:transitions};record.digest=stableDigest(record);
  validateQualificationRecord(record,corpus);
  fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(record,null,2)}\n`,'utf8');
  process.stdout.write(`${JSON.stringify({output:path.resolve(args.output),cases:transitions.length,debugCommit:record.debugCommit,coreCommit:record.coreCommit,readyForPromotion:record.readiness.ready,gaps:record.readiness.gaps,digest:record.digest})}\n`);
}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={runContext,validateQualificationRecord};
