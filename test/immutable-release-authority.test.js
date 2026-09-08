'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {GITHUB_ACTIONS_INTEGRATION_ID}=require('../scripts/promotion-repository-governance');
const {PROMOTION_WORKFLOW,PROMOTION_WORKFLOW_PATH,ROADMAP_PENDING,ROADMAP_ACTIVE,validateLifecycleTransition,validateRoadmapTransition,validateActivationCommit,validatePromotionRun,expectedPromotionRunContext,validateArtifactRunContext,validateCiGate}=require('../scripts/immutable-release-authority');
const {verifyDevelopmentBoundary}=require('../scripts/verify-development-boundary');

function git(dir,args){return execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function writeJson(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
function makeActivationRepo(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-release-'));
  git(dir,['init']);git(dir,['config','user.email','test@example.invalid']);git(dir,['config','user.name','Codex Debug Test']);
  writeJson(path.join(dir,'product-contract.json'),{productId:'codex-debug-safe',productVersion:'0.1.13',lifecycle:'development',safeCoreCommit:'a'.repeat(40)});
  fs.writeFileSync(path.join(dir,'ROADMAP.md'),`# Roadmap\n\n${ROADMAP_PENDING}\n`);
  git(dir,['add','.']);git(dir,['commit','-m','promotion source']);const promotionSha=git(dir,['rev-parse','HEAD']);
  writeJson(path.join(dir,'product-contract.json'),{productId:'codex-debug-safe',productVersion:'0.1.13',lifecycle:'active',safeCoreCommit:'a'.repeat(40)});
  fs.writeFileSync(path.join(dir,'ROADMAP.md'),`# Roadmap\n\n${ROADMAP_ACTIVE}\n`);
  git(dir,['add','.']);git(dir,['commit','-m','activate']);const releaseSha=git(dir,['rev-parse','HEAD']);
  return {dir,promotionSha,releaseSha};
}

test('lifecycle activation changes only development to active and the roadmap checkbox',()=>{
  assert.doesNotThrow(()=>validateLifecycleTransition({a:1,lifecycle:'development'},{a:1,lifecycle:'active'}));
  assert.throws(()=>validateLifecycleTransition({a:1,lifecycle:'development'},{a:2,lifecycle:'active'}),/only change Product Contract lifecycle/);
  assert.doesNotThrow(()=>validateRoadmapTransition(`x\n${ROADMAP_PENDING}\n`,`x\n${ROADMAP_ACTIVE}\n`));
  assert.throws(()=>validateRoadmapTransition(`x\n${ROADMAP_PENDING}\n`,`changed\n${ROADMAP_ACTIVE}\n`),/only mark/);
});

test('activation commit must be the single direct child and only touch lifecycle surfaces',()=>{
  const fixture=makeActivationRepo();
  try{
    const result=validateActivationCommit(fixture.dir,fixture.promotionSha,fixture.releaseSha);
    assert.deepEqual(result.changedFiles,['ROADMAP.md','product-contract.json']);
    fs.writeFileSync(path.join(fixture.dir,'extra.txt'),'nope\n');git(fixture.dir,['add','.']);git(fixture.dir,['commit','-m','extra']);const extra=git(fixture.dir,['rev-parse','HEAD']);
    assert.throws(()=>validateActivationCommit(fixture.dir,fixture.releaseSha,extra),/activation commit may change only/);
  }finally{fs.rmSync(fixture.dir,{recursive:true,force:true});}
});

test('promotion run must be the exact successful workflow_dispatch workflow on main',()=>{
  const sha='a'.repeat(40),run={id:123,name:PROMOTION_WORKFLOW,path:PROMOTION_WORKFLOW_PATH,event:'workflow_dispatch',conclusion:'success',head_branch:'main',head_sha:sha,run_attempt:2,repository:{full_name:'jiying2007/codex-debug'}};
  assert.doesNotThrow(()=>validatePromotionRun(run,{repository:'jiying2007/codex-debug',promotionRunId:'123',promotionSha:sha}));
  assert.throws(()=>validatePromotionRun({...run,path:'.github/workflows/other.yml'},{repository:'jiying2007/codex-debug',promotionRunId:'123',promotionSha:sha}),/workflow path mismatch/);
  assert.throws(()=>validatePromotionRun({...run,event:'push'},{repository:'jiying2007/codex-debug',promotionRunId:'123',promotionSha:sha}),/workflow_dispatch/);
  assert.throws(()=>validatePromotionRun({...run,conclusion:'failure'},{repository:'jiying2007/codex-debug',promotionRunId:'123',promotionSha:sha}),/successful/);
  assert.throws(()=>validatePromotionRun({...run,run_attempt:0},{repository:'jiying2007/codex-debug',promotionRunId:'123',promotionSha:sha}),/attempt is invalid/);
});

test('promotion artifact runContext must match the selected GitHub run identity',()=>{
  const sha='c'.repeat(40),run={id:456,name:PROMOTION_WORKFLOW,path:PROMOTION_WORKFLOW_PATH,event:'workflow_dispatch',conclusion:'success',head_branch:'main',head_sha:sha,run_attempt:3,repository:{full_name:'jiying2007/codex-debug'}};
  const expected=expectedPromotionRunContext(run,'jiying2007/codex-debug',sha);
  assert.deepEqual(expected,{workflow:PROMOTION_WORKFLOW,runId:'456',runAttempt:'3',event:'workflow_dispatch',repository:'jiying2007/codex-debug',sourceSha:sha});
  assert.doesNotThrow(()=>validateArtifactRunContext({...expected},expected,'model'));
  for(const key of ['workflow','runId','runAttempt','event','repository','sourceSha']){
    assert.throws(()=>validateArtifactRunContext({...expected,[key]:'different'},expected,'model'),new RegExp(`model runContext mismatch: ${key}`));
  }
  assert.throws(()=>validateArtifactRunContext(null,expected,'qualification'),/qualification runContext is required/);
});

test('release source requires exactly one successful CI Gate from GitHub Actions',()=>{
  const sha='b'.repeat(40),good={id:9,name:'CI Gate',head_sha:sha,status:'completed',conclusion:'success',app:{id:GITHUB_ACTIONS_INTEGRATION_ID}};
  assert.equal(validateCiGate({check_runs:[good]},sha).id,9);
  assert.throws(()=>validateCiGate({check_runs:[{...good,app:{id:999}}]},sha),/exactly one CI Gate/);
  assert.throws(()=>validateCiGate({check_runs:[good,{...good,id:10}]},sha),/exactly one CI Gate/);
  assert.throws(()=>validateCiGate({check_runs:[{...good,conclusion:'failure'}]},sha),/successful/);
});

test('development boundary permits only the dormant authority-gated immutable release workflow',()=>{
  const result=verifyDevelopmentBoundary();
  assert.equal(result.lifecycle,'development');
  assert.equal(result.immutableReleaseWorkflow,true);
  assert.equal(result.ordinaryPublicationSurfaces,false);
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','immutable-release.yml'),'utf8');
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/^\s*(?:push|pull_request|schedule|repository_dispatch)\s*:/m);
  assert.ok(workflow.indexOf("lifecycle!=='active'")<workflow.indexOf('gh release create'));
  assert.match(workflow,/promotion_run_id/);
  assert.match(workflow,/immutable-release-authority\.js/);
  assert.match(workflow,/actions\/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8/);
  assert.doesNotMatch(workflow,/VSCE_PAT|OVSX_PAT|NPM_TOKEN|npm publish|vsce publish|ovsx publish/i);
});
