#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {runReproductionSeries}=require('../src/reproduction');
const {stableDigest}=require('./model-evaluation');

const SAFE_ENV_KEYS=new Set(['PATH','Path','SYSTEMROOT','SystemRoot','WINDIR','windir','COMSPEC','ComSpec','PATHEXT','TEMP','TMP','TMPDIR','LANG','LC_ALL','CI','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','PROCESSOR_IDENTIFIER']);
function isolatedHistoricalEnv(home){
  const env={};
  for(const key of SAFE_ENV_KEYS)if(process.env[key]!==undefined)env[key]=process.env[key];
  env.HOME=home;
  env.USERPROFILE=home;
  env.XDG_CONFIG_HOME=path.join(home,'.config');
  env.GIT_CONFIG_GLOBAL=path.join(home,'gitconfig');
  env.GIT_CONFIG_NOSYSTEM='1';
  env.GIT_TERMINAL_PROMPT='0';
  env.GCM_INTERACTIVE='Never';
  env.NPM_CONFIG_USERCONFIG=path.join(home,'npmrc');
  fs.mkdirSync(env.XDG_CONFIG_HOME,{recursive:true,mode:0o700});
  fs.writeFileSync(env.GIT_CONFIG_GLOBAL,'','utf8');
  fs.writeFileSync(env.NPM_CONFIG_USERCONFIG,'','utf8');
  return Object.freeze(env);
}
function git(args,cwd,env){return execFileSync('git',args,{cwd,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:4*1024*1024}).trim();}
function cleanCheckout(root,commit,env){git(['-c','submodule.recurse=false','checkout','--detach','--force',commit],root,env);git(['clean','-fdx'],root,env);return git(['rev-parse','HEAD'],root,env);}
function digestRepresentative(result){return stableDigest({exitCode:result?.exitCode??null,signal:result?.signal||'',timedOut:Boolean(result?.timedOut),stdoutDigest:stableDigest(String(result?.stdout||'')),stderrDigest:stableDigest(String(result?.stderr||''))});}
function runTransitionInRepo(root,item,{env=process.env}={}){
  const badHead=cleanCheckout(root,item.badCommit,env);
  assert.equal(badHead,item.badCommit,`bad checkout mismatch for ${item.id}`);
  const bad=runReproductionSeries(item.reproduction.command,{runs:item.reproduction.runs,cwd:root,timeoutMs:item.reproduction.timeoutMs,maxBuffer:4*1024*1024,env});
  assert.equal(bad.summary.reproducibleFailure,true,`bad commit does not reproduce a stable failure for ${item.id}`);
  const fixedHead=cleanCheckout(root,item.fixedCommit,env);
  assert.equal(fixedHead,item.fixedCommit,`fixed checkout mismatch for ${item.id}`);
  const fixed=runReproductionSeries(item.reproduction.command,{runs:item.reproduction.runs,cwd:root,timeoutMs:item.reproduction.timeoutMs,maxBuffer:4*1024*1024,env});
  assert.equal(fixed.summary.failures,0,`fixed commit still fails the exact reproduction for ${item.id}`);
  return Object.freeze({caseId:item.id,repository:item.repository,badCommit:item.badCommit,fixedCommit:item.fixedCommit,commandDigest:stableDigest(item.reproduction.command),badSummary:bad.summary,fixedSummary:fixed.summary,badRepresentativeDigest:digestRepresentative(bad.representative),fixedRepresentativeDigest:digestRepresentative(fixed.representative),transitionDigest:stableDigest({caseId:item.id,badCommit:item.badCommit,fixedCommit:item.fixedCommit,command:item.reproduction.command,bad:bad.summary,fixed:fixed.summary})});
}
function materializeHistoricalCase(item){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-promotion-'));
  const home=path.join(temp,'home'),repo=path.join(temp,'repo');
  fs.mkdirSync(home,{recursive:true,mode:0o700});
  const env=isolatedHistoricalEnv(home);
  try{
    fs.mkdirSync(repo,{recursive:true});
    git(['init','-q'],repo,env);
    git(['remote','add','origin',item.repository],repo,env);
    git(['fetch','--no-tags','--filter=blob:none','origin',item.fixedCommit,item.badCommit],repo,env);
    const parent=git(['rev-parse',`${item.fixedCommit}^`],repo,env);
    assert.equal(parent,item.badCommit,`fixedCommit must be a direct child of badCommit for ${item.id}`);
    const transition=runTransitionInRepo(repo,item,{env});
    cleanCheckout(repo,item.badCommit,env);
    return {temp,home,repo,env,transition,cleanup(){fs.rmSync(temp,{recursive:true,force:true});}};
  }catch(error){fs.rmSync(temp,{recursive:true,force:true});throw error;}
}
function main(){throw new Error('historical-case.js is a library; use promotion-live-eval.js or the unit tests.');}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={isolatedHistoricalEnv,runTransitionInRepo,materializeHistoricalCase};
