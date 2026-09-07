'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {stableDigest}=require('../scripts/model-evaluation');
const {refPatternMatches,targetsBranch,publicRulesetProjection,validateGovernanceLock,createGovernanceLock,evaluateGovernance,validateGovernanceReceipt}=require('../scripts/promotion-repository-governance');
const {parseArgs:parseLockArgs}=require('../scripts/promotion-repository-governance-lock');

const SHA='a'.repeat(40),REPO='jiying2007/codex-debug';
function ruleset(overrides={}){
  const value={id:123,name:'codex-debug-main-promotion-governance',target:'branch',source_type:'Repository',source:REPO,enforcement:'active',created_at:'2026-09-07T01:00:00Z',updated_at:'2026-09-07T01:01:00Z',bypass_actors:[],conditions:{ref_name:{include:['~DEFAULT_BRANCH'],exclude:[]}},rules:[
    {type:'deletion'},
    {type:'non_fast_forward'},
    {type:'pull_request',parameters:{dismiss_stale_reviews_on_push:true,required_approving_review_count:0}},
    {type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,do_not_enforce_on_create:false,required_status_checks:[{context:'CI Gate'}]}}
  ]};
  return Object.assign(value,overrides);
}
function visible(value=ruleset()){
  const out=JSON.parse(JSON.stringify(value));
  delete out.bypass_actors;
  return out;
}
function lock(value=ruleset()){
  return createGovernanceLock({repository:REPO,branch:'main',requiredCheck:'CI Gate',ruleset:value,reviewedAt:'2026-09-07T01:02:00.000Z'});
}
function receipt(rs=[visible()],governanceLock=lock()){
  return evaluateGovernance({repository:REPO,branch:'main',sourceSha:SHA,rulesets:rs,lock:governanceLock,recordedAt:'2026-09-07T01:20:00.000Z',runContext:{workflow:'Promotion Model Evaluation',runId:'99',runAttempt:'1',event:'workflow_dispatch',repository:REPO,sourceSha:SHA}});
}

test('ruleset targeting accepts default branch and exact/glob refs while respecting excludes',()=>{
  assert.equal(refPatternMatches('~DEFAULT_BRANCH','refs/heads/main','main'),true);
  assert.equal(refPatternMatches('refs/heads/*','refs/heads/main','main'),true);
  assert.equal(targetsBranch(ruleset(),'main'),true);
  assert.equal(targetsBranch(ruleset({conditions:{ref_name:{include:['~ALL'],exclude:['refs/heads/main']}}}),'main'),false);
});

test('admin-reviewed governance lock requires visible empty bypass actors and binds the public projection',()=>{
  const good=lock();
  assert.equal(good.reviewed,true);assert.equal(good.ruleset.bypassActorCount,0);assert.equal(good.ruleset.publicProjectionDigest,stableDigest(publicRulesetProjection(ruleset())));assert.doesNotThrow(()=>validateGovernanceLock(good,{expectedRepository:REPO,expectedBranch:'main',expectedRequiredCheck:'CI Gate'}));
  const hidden=visible();
  assert.throws(()=>createGovernanceLock({repository:REPO,ruleset:hidden}),/expose bypass_actors/);
  assert.throws(()=>createGovernanceLock({repository:REPO,ruleset:ruleset({bypass_actors:[{actor_id:1,actor_type:'RepositoryRole',bypass_mode:'always'}]})}),/bypass actors must be empty/);
});

test('low-privilege live ruleset may hide bypass actors only when an admin-reviewed lock matches exactly',()=>{
  const governanceLock=lock(),value=receipt([visible()],governanceLock);
  assert.equal(value.ready,true);assert.deepEqual(value.gaps,[]);assert.equal(value.rulesets.length,1);assert.equal(value.governanceLockDigest,governanceLock.lockDigest);assert.match(value.digest,/^[0-9a-f]{64}$/);
  assert.doesNotThrow(()=>validateGovernanceReceipt(value,{expectedRepository:REPO,expectedBranch:'main',expectedSourceSha:SHA,expectedLockDigest:governanceLock.lockDigest}));
});

test('repository governance rejects ruleset drift after admin review, including hidden bypass-change timestamp drift',()=>{
  const governanceLock=lock();
  const timeDrift=visible(ruleset({updated_at:'2026-09-07T01:03:00Z'}));
  const changed=visible();changed.rules=changed.rules.map(x=>x.type==='required_status_checks'?{...x,parameters:{...x.parameters,required_status_checks:[{context:'security'}]}}:x);
  const exposedBypass={...visible(),bypass_actors:[{actor_id:1,actor_type:'RepositoryRole',bypass_mode:'always'}]};
  for(const live of [timeDrift,changed,exposedBypass]){const value=receipt([live],governanceLock);assert.equal(value.ready,false);assert.ok(value.gaps.length>0);assert.throws(()=>validateGovernanceReceipt(value),/not ready/);}
});

test('repository governance rejects weak or missing reviewed rulesets',()=>{
  const governanceLock=lock();
  const weak=visible();weak.rules=weak.rules.filter(x=>x.type!=='non_fast_forward');
  assert.equal(receipt([],governanceLock).ready,false);
  assert.equal(receipt([weak],governanceLock).ready,false);
  assert.equal(receipt([visible(ruleset({enforcement:'disabled'}))],governanceLock).ready,false);
});

test('checked-in governance lock stays valid but deliberately unreviewed until an admin snapshot exists',()=>{
  const draft=JSON.parse(fs.readFileSync(path.join(__dirname,'..','quality','promotion-repository-governance-lock.json'),'utf8'));
  assert.equal(draft.reviewed,false);assert.equal(draft.ruleset,null);
  assert.doesNotThrow(()=>validateGovernanceLock(draft,{expectedRepository:REPO,expectedBranch:'main',expectedRequiredCheck:'CI Gate',requireReviewed:false}));
  assert.throws(()=>validateGovernanceLock(draft,{requireReviewed:true}),/not reviewed/);
});

test('receipt and governance lock tampering remain digest-bound',()=>{
  const governanceLock=lock(),value=JSON.parse(JSON.stringify(receipt([visible()],governanceLock)));value.rulesets[0].name='tampered';assert.throws(()=>validateGovernanceReceipt(value),/self digest mismatch/);
  const forged=JSON.parse(JSON.stringify(governanceLock));forged.ruleset.updatedAt='2026-09-07T01:05:00Z';assert.throws(()=>validateGovernanceLock(forged),/self digest mismatch/);
});

test('governance lock generator CLI parser keeps admin snapshot generation outside workflow',()=>{
  assert.deepEqual(parseLockArgs(['--repository',REPO,'--admin-snapshot','ruleset.json','--output','lock.json']),{repository:REPO,branch:'main',requiredCheck:'CI Gate',adminSnapshot:'ruleset.json',output:'lock.json'});
  assert.throws(()=>parseLockArgs(['--unknown']),/Unknown argument/);
});

test('promotion workflow requires reviewed governance lock before historical execution and retains both lock and receipt',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','promotion-model-eval.yml'),'utf8');
  const governance=workflow.indexOf('Verify repository governance for promotion'),qualification=workflow.indexOf('Qualify historical transitions for this exact evaluation run'),model=workflow.indexOf('Record historical live-model evaluation');
  assert.ok(governance>0&&qualification>governance&&model>qualification);
  assert.match(workflow,/Verify repository governance for promotion[\s\S]{0,300}if:\s*\$\{\{ inputs\.promotion_mode \}\}/);
  assert.match(workflow,/cp quality\/promotion-repository-governance-lock\.json PROMOTION_REPOSITORY_GOVERNANCE_LOCK\.json/);
  assert.match(workflow,/promotion-repository-governance\.js[\s\S]{0,500}--lock PROMOTION_REPOSITORY_GOVERNANCE_LOCK\.json/);
  assert.match(workflow,/PROMOTION_REPOSITORY_GOVERNANCE_LOCK\.json[\s\S]*PROMOTION_REPOSITORY_GOVERNANCE\.json/);
  assert.equal((workflow.match(/GITHUB_TOKEN:\s*\$\{\{ github\.token \}\}/g)||[]).length,1,'GitHub token must be scoped only to governance step');
  assert.doesNotMatch(workflow,/node\s+scripts\/promotion-repository-governance-lock\.js\b/,'admin lock generation must never run inside Actions');
  assert.doesNotMatch(workflow,/GOVERNANCE_(?:TOKEN|PAT)|ADMIN_(?:TOKEN|PAT)/i,'promotion workflow must not receive an administration credential');
  assert.match(workflow,/permissions:\s*\n\s+contents:\s*read\b/);assert.doesNotMatch(workflow,/\bcontents:\s*write\b/i);assert.doesNotMatch(workflow,/\bgit\s+push\b/i);
});
