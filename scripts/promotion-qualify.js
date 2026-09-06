#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const corpus=require('../quality/promotion-corpus.json');
const {stableDigest}=require('./model-evaluation');
const {validatePromotionCorpus,promotionReadiness}=require('./promotion-corpus');
const {materializeHistoricalCase}=require('./historical-case');

function head(root){return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function core(root){return execFileSync('git',['ls-files','--stage','src/codex-safe-core'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split(/\s+/)[1];}
function parseArgs(argv){const out={output:'PROMOTION_CORPUS_QUALIFICATION.json'};for(let i=0;i<argv.length;i++){if(argv[i]==='--output')out.output=argv[++i];else throw new Error(`Unknown argument: ${argv[i]}`);}return out;}
function runContext(){return {workflow:String(process.env.GITHUB_WORKFLOW||''),runId:String(process.env.GITHUB_RUN_ID||''),runAttempt:String(process.env.GITHUB_RUN_ATTEMPT||''),event:String(process.env.GITHUB_EVENT_NAME||''),repository:String(process.env.GITHUB_REPOSITORY||''),sourceSha:String(process.env.GITHUB_SHA||'')};}
function main(){
  const args=parseArgs(process.argv.slice(2));
  validatePromotionCorpus(corpus);
  const transitions=[];
  for(const item of corpus.cases){const materialized=materializeHistoricalCase(item);try{transitions.push(materialized.transition);}finally{materialized.cleanup();}}
  const root=path.resolve(__dirname,'..'),record={schemaVersion:1,kind:'codex-debug-promotion-corpus-qualification',recordedAt:new Date().toISOString(),debugCommit:head(root),coreCommit:core(root),corpusDigest:stableDigest(corpus),readiness:promotionReadiness(corpus),runContext:runContext(),cases:transitions};record.digest=stableDigest(record);
  fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(record,null,2)}\n`,'utf8');
  process.stdout.write(`${JSON.stringify({output:path.resolve(args.output),cases:transitions.length,debugCommit:record.debugCommit,coreCommit:record.coreCommit,readyForPromotion:record.readiness.ready,gaps:record.readiness.gaps,digest:record.digest})}\n`);
}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={runContext};
