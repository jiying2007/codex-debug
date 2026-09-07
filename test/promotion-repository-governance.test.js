'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {stableDigest}=require('../scripts/model-evaluation');
const {refPatternMatches,targetsBranch,evaluateGovernance,validateGovernanceReceipt}=require('../scripts/promotion-repository-governance');

const SHA='a'.repeat(40);
function ruleset(overrides={}){
  const value={id:123,name:'main-promotion-governance',target:'branch',source_type:'Repository',source:'jiying2007/codex-debug',enforcement:'active',bypass_actors:[],conditions:{ref_name:{include:['~DEFAULT_BRANCH'],exclude:[]}},rules:[
    {type:'deletion'},
    {type:'non_fast_forward'},
    {type:'pull_request',parameters:{dismiss_stale_reviews_on_push:true,required_approving_review_count:1}},
    {type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,do_not_enforce_on_create:false,required_status_checks:[{context:'CI Gate'}]}}
  ]};
  return Object.assign(value,overrides);
}
function receipt(rs=[ruleset()]){return evaluateGovernance({repository:'jiying2007/codex-debug',branch:'main',sourceSha:SHA,rulesets:rs,recordedAt:'2026-09-07T01:20:00.000Z',runContext:{workflow:'Promotion Model Evaluation',runId:'99',runAttempt:'1',event:'workflow_dispatch',repository:'jiying2007/codex-debug',sourceSha:SHA}});}

test('ruleset targeting accepts default branch and exact/glob refs while respecting excludes',()=>{
  assert.equal(refPatternMatches('~DEFAULT_BRANCH','refs/heads/main','main'),true);
  assert.equal(refPatternMatches('refs/heads/*','refs/heads/main','main'),true);
  assert.equal(targetsBranch(ruleset(),'main'),true);
  assert.equal(targetsBranch(ruleset({conditions:{ref_name:{include:['~ALL'],exclude:['refs/heads/main']}}}),'main'),false);
});

test('repository governance is ready only with PR stale-review dismissal strict CI Gate no force-push no deletion and no bypass',()=>{
  const value=receipt();
  assert.equal(value.ready,true);assert.deepEqual(value.gaps,[]);assert.equal(value.rulesets.length,1);assert.equal(value.rulesets[0].name,'main-promotion-governance');assert.ok(value.rulesets[0].requiredChecks.includes('CI Gate'));assert.match(value.rulesets[0].rulesetDigest,/^[0-9a-f]{64}$/);assert.match(value.digest,/^[0-9a-f]{64}$/);assert.doesNotThrow(()=>validateGovernanceReceipt(value,{expectedRepository:'jiying2007/codex-debug',expectedBranch:'main',expectedSourceSha:SHA}));
});

test('repository governance fails closed when any required main protection rule is absent or weak',()=>{
  const cases=[
    ruleset({rules:ruleset().rules.filter(x=>x.type!=='pull_request')}),
    ruleset({rules:ruleset().rules.map(x=>x.type==='pull_request'?{...x,parameters:{...x.parameters,dismiss_stale_reviews_on_push:false}}:x)}),
    ruleset({rules:ruleset().rules.filter(x=>x.type!=='non_fast_forward')}),
    ruleset({rules:ruleset().rules.filter(x=>x.type!=='deletion')}),
    ruleset({rules:ruleset().rules.map(x=>x.type==='required_status_checks'?{...x,parameters:{...x.parameters,required_status_checks:[{context:'security'}]}}:x)}),
    ruleset({rules:ruleset().rules.map(x=>x.type==='required_status_checks'?{...x,parameters:{...x.parameters,strict_required_status_checks_policy:false}}:x)}),
    ruleset({bypass_actors:[{actor_id:1,actor_type:'RepositoryRole',bypass_mode:'always'}]})
  ];
  for(const item of cases){const value=receipt([item]);assert.equal(value.ready,false);assert.ok(value.gaps.length>0);assert.throws(()=>validateGovernanceReceipt(value),/not ready/);}
});

test('repository governance rejects inactive or non-targeting rulesets and receipt tampering',()=>{
  assert.equal(receipt([ruleset({enforcement:'disabled'})]).ready,false);
  assert.equal(receipt([ruleset({conditions:{ref_name:{include:['refs/heads/release'],exclude:[]}}})]).ready,false);
  const value=JSON.parse(JSON.stringify(receipt()));value.rulesets[0].name='tampered';assert.throws(()=>validateGovernanceReceipt(value),/self digest mismatch/);
  const rehashed=JSON.parse(JSON.stringify(receipt()));rehashed.sourceSha='b'.repeat(40);delete rehashed.digest;rehashed.digest=stableDigest(rehashed);assert.throws(()=>validateGovernanceReceipt(rehashed,{expectedSourceSha:SHA}),/sourceSha mismatch/);
});

test('promotion workflow requires live repository governance only in promotion mode before historical execution and retains receipt',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','promotion-model-eval.yml'),'utf8');
  const governance=workflow.indexOf('Verify repository governance for promotion'),qualification=workflow.indexOf('Qualify historical transitions for this exact evaluation run'),model=workflow.indexOf('Record historical live-model evaluation');
  assert.ok(governance>0&&qualification>governance&&model>qualification);
  assert.match(workflow,/Verify repository governance for promotion[\s\S]{0,300}if:\s*\$\{\{ inputs\.promotion_mode \}\}/);
  assert.match(workflow,/promotion-repository-governance\.js/);
  assert.match(workflow,/--required-check 'CI Gate'/);
  assert.match(workflow,/PROMOTION_REPOSITORY_GOVERNANCE\.json/);
  assert.equal((workflow.match(/GITHUB_TOKEN:\s*\$\{\{ github\.token \}\}/g)||[]).length,1,'GitHub token must be scoped only to governance step');
  assert.match(workflow,/permissions:\s*\n\s+contents:\s*read\b/);assert.doesNotMatch(workflow,/\bcontents:\s*write\b/i);assert.doesNotMatch(workflow,/\bgit\s+push\b/i);
});
