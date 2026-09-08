'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {validateGovernanceLock,GITHUB_ACTIONS_INTEGRATION_ID}=require('../scripts/promotion-repository-governance');
const {DEFAULT_REPOSITORY,DEFAULT_RULESET_NAME,rulesetPayload,calibrationArgs,parseArgs,validateArgs,runBootstrap,ensureRuleset,triggerCalibration}=require('../scripts/promotion-authority-bootstrap');

const REPO=DEFAULT_REPOSITORY;
function adminRuleset(overrides={}){
  const base={id:321,name:DEFAULT_RULESET_NAME,target:'branch',source_type:'Repository',source:REPO,enforcement:'active',created_at:'2026-09-07T05:00:00Z',updated_at:'2026-09-07T05:01:00Z',bypass_actors:[],conditions:{ref_name:{include:['refs/heads/main'],exclude:[]}},rules:[
    {type:'pull_request',parameters:{allowed_merge_methods:['squash'],dismiss_stale_reviews_on_push:true,require_code_owner_review:false,require_last_push_approval:false,required_approving_review_count:0,required_review_thread_resolution:true}},
    {type:'required_status_checks',parameters:{do_not_enforce_on_create:false,required_status_checks:[{context:'CI Gate',integration_id:GITHUB_ACTIONS_INTEGRATION_ID}],strict_required_status_checks_policy:true}},
    {type:'non_fast_forward'},
    {type:'deletion'}
  ]};
  return Object.assign(base,overrides);
}
function applyArgs(output){return {...parseArgs([]),applyRuleset:true,acknowledgeRulesetChange:true,lockOutput:output};}

test('bootstrap is dry-run by default and performs no gh operation',()=>{
  const result=runBootstrap(parseArgs([]),{runGh:()=>{throw new Error('gh must not run in dry-run');}});
  assert.equal(result.mode,'dry-run');
  assert.equal(result.repository,REPO);
  assert.deepEqual(result.ruleset.mutationRequires,['--apply-ruleset','--acknowledge-ruleset-change']);
  assert.equal(result.ruleset.payload.bypass_actors.length,0);
  assert.deepEqual(result.calibration.mutationRequires,['--trigger-calibration','--acknowledge-historical-execution']);
  assert.equal(result.calibration.providerMode,'openai');
  assert.equal(result.calibration.providerBaseUrl,'');
  assert.ok(result.calibration.ghArgs.includes('provider_mode=openai'));
  assert.ok(result.calibration.ghArgs.includes('provider_base_url='));
  assert.ok(result.calibration.ghArgs.includes('promotion_mode=false'));
});

test('ruleset payload exactly encodes stable explicit main governance and GitHub Actions check source',()=>{
  const payload=rulesetPayload();
  assert.equal(payload.target,'branch');assert.equal(payload.enforcement,'active');assert.deepEqual(payload.bypass_actors,[]);
  assert.deepEqual(payload.conditions.ref_name,{include:['refs/heads/main'],exclude:[]});
  assert.equal(JSON.stringify(payload).includes('~DEFAULT_BRANCH'),false);
  const byType=new Map(payload.rules.map(rule=>[rule.type,rule]));
  assert.equal(byType.get('pull_request').parameters.dismiss_stale_reviews_on_push,true);
  assert.deepEqual(byType.get('pull_request').parameters.allowed_merge_methods,['squash']);
  assert.equal(byType.get('required_status_checks').parameters.strict_required_status_checks_policy,true);
  assert.deepEqual(byType.get('required_status_checks').parameters.required_status_checks,[{context:'CI Gate',integration_id:GITHUB_ACTIONS_INTEGRATION_ID}]);
  assert.ok(byType.has('non_fast_forward'));assert.ok(byType.has('deletion'));
});

test('mutating actions require independent explicit acknowledgements',()=>{
  assert.throws(()=>validateArgs({...parseArgs([]),applyRuleset:true}),/acknowledge-ruleset-change/);
  assert.throws(()=>validateArgs({...parseArgs([]),triggerCalibration:true}),/acknowledge-historical-execution/);
  assert.doesNotThrow(()=>validateArgs({...parseArgs([]),applyRuleset:true,acknowledgeRulesetChange:true}));
  assert.doesNotThrow(()=>validateArgs({...parseArgs([]),triggerCalibration:true,acknowledgeHistoricalExecution:true}));
});

test('existing acceptable ruleset is never mutated and produces only a candidate lock',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-bootstrap-')),output=path.join(dir,'lock.json'),calls=[];
  try{
    const detail=adminRuleset();
    const runGh=(args)=>{calls.push(args);if(args[1]===`repos/${REPO}/rulesets?per_page=100`)return JSON.stringify([{id:detail.id,name:detail.name}]);if(args[1]===`repos/${REPO}/rulesets/${detail.id}`)return JSON.stringify(detail);throw new Error(`unexpected gh call ${args.join(' ')}`);};
    const result=ensureRuleset(applyArgs(output),runGh);
    assert.equal(result.created,false);assert.equal(result.rulesetId,detail.id);assert.equal(calls.some(args=>args.includes('POST')),false);
    const candidate=JSON.parse(fs.readFileSync(output,'utf8'));
    assert.equal(candidate.reviewed,true);assert.equal(candidate.ruleset.id,detail.id);assert.equal(candidate.ruleset.bypassActorCount,0);
    assert.doesNotThrow(()=>validateGovernanceLock(candidate,{expectedRepository:REPO,expectedBranch:'main',expectedRequiredCheck:'CI Gate'}));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('missing ruleset is created once from the exact payload then re-read before lock generation',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-bootstrap-')),output=path.join(dir,'lock.json'),calls=[];
  try{
    const detail=adminRuleset();
    const runGh=(args,options={})=>{
      calls.push({args,input:options.input||''});
      if(args[1]===`repos/${REPO}/rulesets?per_page=100`)return '[]';
      if(args.includes('--method')&&args.includes('POST')){assert.deepEqual(JSON.parse(options.input),rulesetPayload());return JSON.stringify({id:detail.id,name:detail.name});}
      if(args[1]===`repos/${REPO}/rulesets/${detail.id}`)return JSON.stringify(detail);
      throw new Error(`unexpected gh call ${args.join(' ')}`);
    };
    const result=ensureRuleset(applyArgs(output),runGh);
    assert.equal(result.created,true);assert.equal(calls.filter(call=>call.args.includes('POST')).length,1);
    assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).ruleset.adminSnapshotDigest.length,64);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('hidden, dynamic-target, weak, or wrong-source administrator snapshot is rejected instead of generating a lock',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-bootstrap-')),output=path.join(dir,'lock.json');
  try{
    const variants=[];
    const hidden=adminRuleset();delete hidden.bypass_actors;variants.push([hidden,/expose bypass_actors/]);
    const dynamicTarget=adminRuleset({conditions:{ref_name:{include:['~DEFAULT_BRANCH'],exclude:[]}}});variants.push([dynamicTarget,/must not use ~DEFAULT_BRANCH/]);
    const missingSource=adminRuleset();missingSource.rules=missingSource.rules.map(rule=>rule.type==='required_status_checks'?{...rule,parameters:{...rule.parameters,required_status_checks:[{context:'CI Gate'}]}}:rule);variants.push([missingSource,/GitHub Actions integration/]);
    const wrongSource=adminRuleset();wrongSource.rules=wrongSource.rules.map(rule=>rule.type==='required_status_checks'?{...rule,parameters:{...rule.parameters,required_status_checks:[{context:'CI Gate',integration_id:999}]}}:rule);variants.push([wrongSource,/GitHub Actions integration/]);
    for(const [detail,error] of variants){const runGh=(args)=>args[1].includes('?per_page=100')?JSON.stringify([{id:detail.id,name:detail.name}]):JSON.stringify(detail);assert.throws(()=>ensureRuleset(applyArgs(output),runGh),error);assert.equal(fs.existsSync(output),false);}
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('calibration trigger is fixed to promotion_mode=false and contains no credential material',()=>{
  const args={...parseArgs([]),triggerCalibration:true,acknowledgeHistoricalExecution:true},calls=[];
  const runGh=(values)=>{calls.push(values);return 'https://github.com/jiying2007/codex-debug/actions/runs/123';};
  const result=triggerCalibration(args,runGh);
  assert.equal(result.triggered,true);assert.equal(result.promotionMode,false);assert.equal(result.providerMode,'openai');assert.deepEqual(calls,[calibrationArgs(args)]);
  const command=calls[0].join(' ');
  assert.match(command,/provider_mode=openai/);assert.match(command,/provider_base_url=/);assert.match(command,/promotion_mode=false/);assert.match(command,/acknowledge_historical_execution=true/);assert.doesNotMatch(command,/API_KEY|TOKEN|SECRET/);
});

test('bootstrap supports explicit HTTPS OpenAI-compatible calibration without embedding credentials',()=>{
  const args={...parseArgs(['--provider-mode','openai-compatible','--provider-base-url','https://relay.example/v1','--model','gpt-5.6']),triggerCalibration:true,acknowledgeHistoricalExecution:true},calls=[];
  const runGh=(values)=>{calls.push(values);return 'https://github.com/jiying2007/codex-debug/actions/runs/456';};
  assert.doesNotThrow(()=>validateArgs(args));
  const result=triggerCalibration(args,runGh);
  assert.equal(result.providerMode,'openai-compatible');assert.equal(result.providerBaseUrl,'https://relay.example/v1');
  const command=calls[0].join(' ');
  assert.match(command,/provider_mode=openai-compatible/);assert.match(command,/provider_base_url=https:\/\/relay\.example\/v1/);assert.match(command,/model=gpt-5\.6/);assert.doesNotMatch(command,/API_KEY|TOKEN|SECRET/);
});

test('bootstrap parser rejects unknown flags, invalid Codex versions, and unsafe provider endpoints',()=>{
  assert.throws(()=>parseArgs(['--unknown']),/Unknown argument/);
  assert.throws(()=>validateArgs({...parseArgs([]),codexVersion:'latest;rm -rf /'}),/codex-version/);
  assert.throws(()=>validateArgs({...parseArgs([]),providerMode:'other'}),/provider-mode/);
  assert.throws(()=>validateArgs({...parseArgs([]),providerMode:'openai-compatible'}),/provider-base-url is required/);
  assert.throws(()=>validateArgs({...parseArgs([]),providerMode:'openai-compatible',providerBaseUrl:'http://relay.example/v1'}),/must use HTTPS/);
  assert.throws(()=>validateArgs({...parseArgs([]),providerMode:'openai-compatible',providerBaseUrl:'https://user:pass@relay.example/v1'}),/must not contain credentials/);
  assert.throws(()=>validateArgs({...parseArgs([]),providerMode:'openai',providerBaseUrl:'https://relay.example/v1'}),/must be empty/);
});
