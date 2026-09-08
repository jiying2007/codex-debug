#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createGovernanceLock,GITHUB_ACTIONS_INTEGRATION_ID}=require('./promotion-repository-governance');

const DEFAULT_REPOSITORY='jiying2007/codex-debug';
const DEFAULT_RULESET_NAME='codex-debug-main-promotion-governance';
const DEFAULT_REQUIRED_CHECK='CI Gate';
const DEFAULT_LOCK_OUTPUT='PROMOTION_REPOSITORY_GOVERNANCE_LOCK.candidate.json';
const DEFAULT_PROVIDER_MODE='openai';
const WORKFLOW='promotion-model-eval.yml';

function rulesetPayload({name=DEFAULT_RULESET_NAME,requiredCheck=DEFAULT_REQUIRED_CHECK}={}){
  return {
    name,
    target:'branch',
    enforcement:'active',
    bypass_actors:[],
    conditions:{ref_name:{include:['refs/heads/main'],exclude:[]}},
    rules:[
      {type:'pull_request',parameters:{allowed_merge_methods:['squash'],dismiss_stale_reviews_on_push:true,require_code_owner_review:false,require_last_push_approval:false,required_approving_review_count:0,required_review_thread_resolution:true}},
      {type:'required_status_checks',parameters:{do_not_enforce_on_create:false,required_status_checks:[{context:requiredCheck,integration_id:GITHUB_ACTIONS_INTEGRATION_ID}],strict_required_status_checks_policy:true}},
      {type:'non_fast_forward'},
      {type:'deletion'}
    ]
  };
}

function calibrationArgs({repository=DEFAULT_REPOSITORY,codexVersion='latest',model='',verifierModel='',providerMode=DEFAULT_PROVIDER_MODE,providerBaseUrl=''}={}){
  return ['workflow','run',WORKFLOW,'--repo',repository,'--ref','main','-f',`codex_version=${codexVersion}`,'-f',`model=${model}`,'-f',`verifier_model=${verifierModel}`,'-f',`provider_mode=${providerMode}`,'-f',`provider_base_url=${providerBaseUrl}`,'-f','promotion_mode=false','-f','acknowledge_historical_execution=true'];
}

function parseArgs(argv){
  const out={repository:DEFAULT_REPOSITORY,rulesetName:DEFAULT_RULESET_NAME,requiredCheck:DEFAULT_REQUIRED_CHECK,lockOutput:DEFAULT_LOCK_OUTPUT,codexVersion:'latest',model:'',verifierModel:'',providerMode:DEFAULT_PROVIDER_MODE,providerBaseUrl:'',applyRuleset:false,acknowledgeRulesetChange:false,triggerCalibration:false,acknowledgeHistoricalExecution:false};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--repository')out.repository=argv[++i];
    else if(arg==='--ruleset-name')out.rulesetName=argv[++i];
    else if(arg==='--required-check')out.requiredCheck=argv[++i];
    else if(arg==='--lock-output')out.lockOutput=argv[++i];
    else if(arg==='--codex-version')out.codexVersion=argv[++i];
    else if(arg==='--model')out.model=argv[++i];
    else if(arg==='--verifier-model')out.verifierModel=argv[++i];
    else if(arg==='--provider-mode')out.providerMode=argv[++i];
    else if(arg==='--provider-base-url')out.providerBaseUrl=argv[++i];
    else if(arg==='--apply-ruleset')out.applyRuleset=true;
    else if(arg==='--acknowledge-ruleset-change')out.acknowledgeRulesetChange=true;
    else if(arg==='--trigger-calibration')out.triggerCalibration=true;
    else if(arg==='--acknowledge-historical-execution')out.acknowledgeHistoricalExecution=true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function validateProviderArgs(args){
  assert.ok(['openai','openai-compatible'].includes(String(args.providerMode||'')),'--provider-mode must be openai or openai-compatible');
  const base=String(args.providerBaseUrl||'').trim();
  if(args.providerMode==='openai'){
    assert.equal(base,'','--provider-base-url must be empty for --provider-mode openai');
    return args;
  }
  assert.ok(base,'--provider-base-url is required for --provider-mode openai-compatible');
  let url;
  try{url=new URL(base);}catch{throw new Error('--provider-base-url must be a valid HTTPS URL');}
  assert.equal(url.protocol,'https:','--provider-base-url must use HTTPS for promotion calibration');
  assert.equal(url.username,'','--provider-base-url must not contain credentials');
  assert.equal(url.password,'','--provider-base-url must not contain credentials');
  assert.equal(url.search,'','--provider-base-url must not contain query parameters');
  assert.equal(url.hash,'','--provider-base-url must not contain a fragment');
  return args;
}

function validateArgs(args){
  assert.match(String(args.repository||''),/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,'--repository must be owner/name');
  assert.ok(String(args.rulesetName||''),'--ruleset-name is required');
  assert.ok(String(args.requiredCheck||''),'--required-check is required');
  assert.ok(String(args.lockOutput||''),'--lock-output is required');
  assert.match(String(args.codexVersion||''),/^(?:latest|\d+\.\d+\.\d+)$/,'--codex-version must be latest or x.y.z');
  validateProviderArgs(args);
  if(args.applyRuleset)assert.equal(args.acknowledgeRulesetChange,true,'--apply-ruleset requires --acknowledge-ruleset-change');
  if(args.triggerCalibration)assert.equal(args.acknowledgeHistoricalExecution,true,'--trigger-calibration requires --acknowledge-historical-execution');
  return args;
}

function defaultRunGh(args,{input=''}={}){
  const result=spawnSync('gh',args,{encoding:'utf8',input,maxBuffer:4*1024*1024,env:process.env});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`gh ${args.join(' ')} failed (${result.status}): ${String(result.stderr||result.stdout||'').trim()}`);
  return String(result.stdout||'').trim();
}

function parseJson(text,label){
  try{return JSON.parse(String(text||''));}
  catch(error){throw new Error(`${label} did not return JSON: ${error.message}`);}
}

function dryRunPlan(args){
  validateArgs({...args,applyRuleset:false,triggerCalibration:false});
  return Object.freeze({
    mode:'dry-run',
    repository:args.repository,
    ruleset:{mutationRequires:['--apply-ruleset','--acknowledge-ruleset-change'],payload:rulesetPayload({name:args.rulesetName,requiredCheck:args.requiredCheck}),lockOutput:args.lockOutput},
    calibration:{mutationRequires:['--trigger-calibration','--acknowledge-historical-execution'],providerMode:args.providerMode,providerBaseUrl:args.providerBaseUrl,ghArgs:calibrationArgs(args),promotionMode:false},
    notes:['No repository mutation or workflow dispatch is performed without both action-specific flags.','Governance Lock output is a review candidate only; this script never edits the checked-in lock, commits, merges, changes lifecycle, or publishes a release.']
  });
}

function listRulesets(repository,runGh){
  const data=parseJson(runGh(['api',`repos/${repository}/rulesets?per_page=100`]),'ruleset list');
  assert.ok(Array.isArray(data),'ruleset list must be an array');
  return data;
}

function fetchRuleset(repository,id,runGh){
  assert.ok(Number.isInteger(Number(id))&&Number(id)>0,'ruleset id is invalid');
  return parseJson(runGh(['api',`repos/${repository}/rulesets/${id}`]),'ruleset detail');
}

function exactNamedRuleset(items,name){
  const matches=items.filter(item=>String(item?.name||'')===name);
  assert.ok(matches.length<=1,`multiple rulesets named ${name}; refusing ambiguous mutation`);
  return matches[0]||null;
}

function ensureRuleset(args,runGh=defaultRunGh){
  validateArgs(args);
  assert.equal(args.applyRuleset,true,'ensureRuleset requires --apply-ruleset');
  const summaries=listRulesets(args.repository,runGh);
  let summary=exactNamedRuleset(summaries,args.rulesetName),created=false;
  if(!summary){
    const payload=rulesetPayload({name:args.rulesetName,requiredCheck:args.requiredCheck});
    const createdBody=parseJson(runGh(['api','--method','POST',`repos/${args.repository}/rulesets`,'--input','-'],{input:`${JSON.stringify(payload)}\n`}),'ruleset create');
    assert.ok(Number.isInteger(Number(createdBody?.id))&&Number(createdBody.id)>0,'created ruleset did not return an id');
    summary=createdBody;created=true;
  }
  const detail=fetchRuleset(args.repository,summary.id,runGh);
  assert.equal(String(detail.name||''),args.rulesetName,'live ruleset name changed unexpectedly');
  const lock=createGovernanceLock({repository:args.repository,branch:'main',requiredCheck:args.requiredCheck,ruleset:detail});
  const output=path.resolve(args.lockOutput);
  fs.writeFileSync(output,`${JSON.stringify(lock,null,2)}\n`,'utf8');
  return Object.freeze({created,rulesetId:lock.ruleset.id,rulesetName:lock.ruleset.name,updatedAt:lock.ruleset.updatedAt,lockDigest:lock.lockDigest,lockOutput:output});
}

function triggerCalibration(args,runGh=defaultRunGh){
  validateArgs(args);
  assert.equal(args.triggerCalibration,true,'triggerCalibration requires --trigger-calibration');
  const stdout=runGh(calibrationArgs(args));
  return Object.freeze({triggered:true,workflow:WORKFLOW,promotionMode:false,providerMode:args.providerMode,providerBaseUrl:args.providerBaseUrl,stdout});
}

function runBootstrap(args,{runGh=defaultRunGh}={}){
  validateArgs(args);
  if(!args.applyRuleset&&!args.triggerCalibration)return dryRunPlan(args);
  const result={mode:'apply',repository:args.repository,ruleset:null,calibration:null};
  if(args.applyRuleset)result.ruleset=ensureRuleset(args,runGh);
  if(args.triggerCalibration)result.calibration=triggerCalibration(args,runGh);
  return Object.freeze(result);
}

function main(){
  const args=parseArgs(process.argv.slice(2));
  const result=runBootstrap(args);
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
}

if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={DEFAULT_REPOSITORY,DEFAULT_RULESET_NAME,DEFAULT_REQUIRED_CHECK,DEFAULT_LOCK_OUTPUT,DEFAULT_PROVIDER_MODE,WORKFLOW,rulesetPayload,calibrationArgs,parseArgs,validateProviderArgs,validateArgs,dryRunPlan,listRulesets,fetchRuleset,exactNamedRuleset,ensureRuleset,triggerCalibration,runBootstrap};
