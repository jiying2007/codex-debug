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
const TRUSTED_CORE_PATH='src/codex-safe-core';
const TRUSTED_CORE_URL='https://github.com/jiying2007/codex-safe-core.git';
const SHA40=/^[0-9a-f]{40}$/;
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
function parseSubmoduleConfig(text){
  const rows=[];let current=null;
  for(const raw of String(text||'').split(/\r?\n/)){
    const section=raw.match(/^\s*\[submodule\s+"([^"]+)"\]\s*$/);
    if(section){current={name:section[1],path:'',url:''};rows.push(current);continue;}
    if(!current)continue;
    const pair=raw.match(/^\s*(path|url)\s*=\s*(.*?)\s*$/);
    if(pair)current[pair[1]]=pair[2];
  }
  return rows;
}
function trustedCoreGitlink(root,commit,env,{corePath=TRUSTED_CORE_PATH}={}){
  const entry=git(['ls-tree',commit,'--',corePath],root,env);
  if(!entry)return '';
  const match=entry.match(/^160000\s+commit\s+([0-9a-f]{40})\t(.+)$/);
  assert.ok(match&&match[2]===corePath,`historical ${corePath} must be an exact gitlink when present`);
  return match[1];
}
function resetTrustedCore(root,{corePath=TRUSTED_CORE_PATH}={}){
  fs.rmSync(path.join(root,...corePath.split('/')),{recursive:true,force:true});
  fs.rmSync(path.join(root,'.git','modules',...corePath.split('/')),{recursive:true,force:true});
}
function materializeTrustedCore(root,commit,env,{corePath=TRUSTED_CORE_PATH,trustedCoreUrl=TRUSTED_CORE_URL,allowedProtocols='https'}={}){
  const pin=trustedCoreGitlink(root,commit,env,{corePath});
  resetTrustedCore(root,{corePath});
  if(!pin)return '';
  assert.match(pin,SHA40,'historical Core gitlink must be a 40-hex commit');
  const modules=git(['show',`${commit}:.gitmodules`],root,env),matches=parseSubmoduleConfig(modules).filter(row=>row.path===corePath);
  assert.equal(matches.length,1,`historical ${corePath} must have exactly one .gitmodules mapping`);
  assert.equal(matches[0].url,trustedCoreUrl,`historical ${corePath} must use the reviewed trusted Core repository`);
  const submoduleEnv={...env,GIT_ALLOW_PROTOCOL:String(allowedProtocols||'https')};
  git(['submodule','update','--init','--force','--depth=1','--',corePath],root,submoduleEnv);
  const actual=git(['rev-parse','HEAD'],path.join(root,...corePath.split('/')),submoduleEnv);
  assert.equal(actual,pin,`historical ${corePath} checkout does not match the parent gitlink`);
  return pin;
}
function cleanCheckout(root,commit,env,coreOptions={}){
  resetTrustedCore(root,coreOptions);
  git(['-c','submodule.recurse=false','checkout','--detach','--force',commit],root,env);
  git(['clean','-fdx'],root,env);
  const head=git(['rev-parse','HEAD'],root,env);
  materializeTrustedCore(root,commit,env,coreOptions);
  return head;
}
function digestRepresentative(result){return stableDigest({exitCode:result?.exitCode??null,signal:result?.signal||'',timedOut:Boolean(result?.timedOut),stdoutDigest:stableDigest(String(result?.stdout||'')),stderrDigest:stableDigest(String(result?.stderr||''))});}
function runTransitionInRepo(root,item,{env=process.env,coreOptions={}}={}){
  const badHead=cleanCheckout(root,item.badCommit,env,coreOptions);
  assert.equal(badHead,item.badCommit,`bad checkout mismatch for ${item.id}`);
  const bad=runReproductionSeries(item.reproduction.command,{runs:item.reproduction.runs,cwd:root,timeoutMs:item.reproduction.timeoutMs,maxBuffer:4*1024*1024,env});
  assert.equal(bad.summary.reproducibleFailure,true,`bad commit does not reproduce a stable failure for ${item.id}`);
  const fixedHead=cleanCheckout(root,item.fixedCommit,env,coreOptions);
  assert.equal(fixedHead,item.fixedCommit,`fixed checkout mismatch for ${item.id}`);
  const fixed=runReproductionSeries(item.reproduction.command,{runs:item.reproduction.runs,cwd:root,timeoutMs:item.reproduction.timeoutMs,maxBuffer:4*1024*1024,env});
  assert.equal(fixed.summary.failures,0,`fixed commit still fails the exact reproduction for ${item.id}`);
  return Object.freeze({caseId:item.id,repository:item.repository,anchorRef:item.anchorRef||'',badCommit:item.badCommit,fixedCommit:item.fixedCommit,commandDigest:stableDigest(item.reproduction.command),badSummary:bad.summary,fixedSummary:fixed.summary,badRepresentativeDigest:digestRepresentative(bad.representative),fixedRepresentativeDigest:digestRepresentative(fixed.representative),transitionDigest:stableDigest({caseId:item.id,repository:item.repository,anchorRef:item.anchorRef||'',badCommit:item.badCommit,fixedCommit:item.fixedCommit,command:item.reproduction.command,bad:bad.summary,fixed:fixed.summary})});
}
function materializeHistoricalCase(item){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-promotion-'));
  const home=path.join(temp,'home'),repo=path.join(temp,'repo'),anchor='refs/codex-debug/promotion-anchor';
  fs.mkdirSync(home,{recursive:true,mode:0o700});
  const env=isolatedHistoricalEnv(home);
  try{
    fs.mkdirSync(repo,{recursive:true});
    git(['init','-q'],repo,env);
    git(['remote','add','origin',item.repository],repo,env);
    git(['fetch','--no-tags','--filter=blob:none','origin',`${item.anchorRef}:${anchor}`],repo,env);
    git(['cat-file','-e',`${item.badCommit}^{commit}`],repo,env);
    git(['cat-file','-e',`${item.fixedCommit}^{commit}`],repo,env);
    git(['merge-base','--is-ancestor',item.fixedCommit,anchor],repo,env);
    const parent=git(['rev-parse',`${item.fixedCommit}^`],repo,env);
    assert.equal(parent,item.badCommit,`fixedCommit must be a direct child of badCommit for ${item.id}`);
    const transition=runTransitionInRepo(repo,item,{env});
    return {temp,home,repo,env,transition,cleanup(){fs.rmSync(temp,{recursive:true,force:true});}};
  }catch(error){fs.rmSync(temp,{recursive:true,force:true});throw error;}
}
function main(){throw new Error('historical-case.js is a library; use promotion-live-eval.js or the unit tests.');}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={TRUSTED_CORE_PATH,TRUSTED_CORE_URL,isolatedHistoricalEnv,parseSubmoduleConfig,trustedCoreGitlink,resetTrustedCore,materializeTrustedCore,cleanCheckout,runTransitionInRepo,materializeHistoricalCase};
