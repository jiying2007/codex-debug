#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const corpus=require('../quality/promotion-corpus.json');
const {stableDigest}=require('./model-evaluation');
const {validatePromotionCorpus,promotionReadiness}=require('./promotion-corpus');
const {isolatedHistoricalEnv}=require('./historical-case');

function git(args,cwd,env){return execFileSync('git',args,{cwd,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:4*1024*1024}).trim();}
function repositoryHead(root){return git(['rev-parse','HEAD'],root,process.env);}
function corePin(root){return git(['ls-files','--stage','src/codex-safe-core'],root,process.env).split(/\s+/)[1];}
function runContext(){return {workflow:String(process.env.GITHUB_WORKFLOW||''),runId:String(process.env.GITHUB_RUN_ID||''),runAttempt:String(process.env.GITHUB_RUN_ATTEMPT||''),event:String(process.env.GITHUB_EVENT_NAME||''),repository:String(process.env.GITHUB_REPOSITORY||''),sourceSha:String(process.env.GITHUB_SHA||'')};}
function changedFiles(root,commit,env){const text=git(['diff-tree','--no-commit-id','--name-only','-r',commit],root,env);return text?text.split(/\r?\n/).filter(Boolean):[];}
function verifyRepositoryState(root,item,{anchorCommit,env=process.env}={}){
  git(['cat-file','-e',`${item.badCommit}^{commit}`],root,env);
  git(['cat-file','-e',`${item.fixedCommit}^{commit}`],root,env);
  const anchor=String(anchorCommit||item.fixedCommit);
  git(['merge-base','--is-ancestor',item.fixedCommit,anchor],root,env);
  const parent=git(['rev-parse',`${item.fixedCommit}^`],root,env);
  assert.equal(parent,item.badCommit,`fixedCommit must be a direct child of badCommit for ${item.id}`);
  const files=changedFiles(root,item.fixedCommit,env),fileSet=new Set(files);
  for(const expected of item.groundTruth.files)assert.ok(fileSet.has(expected),`ground-truth file ${expected} is absent from fixed commit ${item.fixedCommit} for ${item.id}`);
  return Object.freeze({caseId:item.id,repository:item.repository,anchorRef:item.anchorRef,badCommit:item.badCommit,fixedCommit:item.fixedCommit,parentCommit:parent,anchorCommit:anchor,changedFilesDigest:stableDigest(files.sort()),groundTruthFiles:[...item.groundTruth.files],provenanceDigest:stableDigest({caseId:item.id,repository:item.repository,anchorRef:item.anchorRef,badCommit:item.badCommit,fixedCommit:item.fixedCommit,parentCommit:parent,anchorCommit:anchor,changedFiles:files.sort(),groundTruthFiles:item.groundTruth.files})});
}
function fetchAndVerify(item){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-provenance-')),home=path.join(temp,'home'),repo=path.join(temp,'repo'),anchorRef='refs/codex-debug/promotion-anchor';
  fs.mkdirSync(home,{recursive:true,mode:0o700});fs.mkdirSync(repo,{recursive:true});
  const env=isolatedHistoricalEnv(home);
  try{
    git(['init','-q'],repo,env);
    git(['remote','add','origin',item.repository],repo,env);
    git(['fetch','--no-tags','--filter=blob:none','origin',`${item.anchorRef}:${anchorRef}`],repo,env);
    const anchorCommit=git(['rev-parse',anchorRef],repo,env);
    return verifyRepositoryState(repo,item,{anchorCommit,env});
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
function validateRecord(record,root=path.resolve(__dirname,'..')){
  assert.equal(record?.schemaVersion,1,'promotion provenance schema mismatch');
  assert.equal(record?.kind,'codex-debug-promotion-provenance','promotion provenance kind mismatch');
  assert.match(String(record.debugCommit||''),/^[0-9a-f]{40}$/,'invalid Debug commit');
  assert.match(String(record.coreCommit||''),/^[0-9a-f]{40}$/,'invalid Core commit');
  assert.equal(record.debugCommit,repositoryHead(root),'promotion provenance Debug commit mismatch');
  assert.equal(record.coreCommit,corePin(root),'promotion provenance Core pin mismatch');
  assert.equal(record.corpusDigest,stableDigest(corpus),'promotion provenance corpus digest mismatch');
  assert.deepEqual(record.readiness,promotionReadiness(corpus),'promotion provenance readiness mismatch');
  assert.deepEqual((record.cases||[]).map(x=>x.caseId).sort(),corpus.cases.map(x=>x.id).sort(),'promotion provenance case set mismatch');
  for(const item of record.cases){assert.match(String(item.provenanceDigest||''),/^[0-9a-f]{64}$/,'invalid promotion provenance digest');assert.equal(item.parentCommit,item.badCommit,`direct-parent binding mismatch for ${item.caseId}`);}
  const copy={...record};delete copy.digest;assert.equal(record.digest,stableDigest(copy),'promotion provenance self digest mismatch');
  const source=String(record.runContext?.sourceSha||'');if(source)assert.equal(source,record.debugCommit,'Actions source SHA must equal promotion provenance Debug commit');
  return record;
}
function parseArgs(argv){const out={output:'PROMOTION_PROVENANCE.json'};for(let i=0;i<argv.length;i++){if(argv[i]==='--output')out.output=argv[++i];else throw new Error(`Unknown argument: ${argv[i]}`);}return out;}
function main(){
  const args=parseArgs(process.argv.slice(2));validatePromotionCorpus(corpus);
  const cases=corpus.cases.map(fetchAndVerify),root=path.resolve(__dirname,'..');
  const record={schemaVersion:1,kind:'codex-debug-promotion-provenance',recordedAt:new Date().toISOString(),debugCommit:repositoryHead(root),coreCommit:corePin(root),corpusDigest:stableDigest(corpus),readiness:promotionReadiness(corpus),runContext:runContext(),cases};record.digest=stableDigest(record);validateRecord(record,root);
  fs.mkdirSync(path.dirname(path.resolve(args.output)),{recursive:true});fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(record,null,2)}\n`,'utf8');
  process.stdout.write(`${JSON.stringify({cases:cases.length,repositories:record.readiness.repositories,failureKinds:record.readiness.failureKinds,readyForPromotion:record.readiness.ready,digest:record.digest,output:path.resolve(args.output)})}\n`);
}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={changedFiles,verifyRepositoryState,fetchAndVerify,validateRecord};
