'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const vm=require('node:vm');const {createRequire}=require('node:module');const {execFileSync}=require('node:child_process');
const {createCancellation}=require('../src/session-budget');const {readSession}=require('../src/session-store');const {validateStoredSession}=require('../src/contracts');

function debugWithFixture(patch,{failObservationAfter=-1}={}){
 const file=path.resolve(__dirname,'../src/debug.js'),localRequire=createRequire(file),actualCodex=localRequire('./codex'),mod={exports:{}};
 const investigation=actualCodex.normalizeInvestigation({rootCause:'Controlled fixture repair',confidence:0.8,hypotheses:[{id:'H1',title:'Fixture',claim:'The fixture changes the observed output.',status:'open',evidenceFor:['fixture'],evidenceAgainst:[],causalAnchors:[],verificationSteps:['Run the explicit fixture.']}],patch:{summary:'Controlled repair',unifiedDiff:patch,rationale:'fixture',risk:'low'},verificationPlan:[],coverageGaps:[]});
 const verification=actualCodex.normalizeCausalVerification({rootCauseAssessment:'supported',confidence:0.8,hypotheses:[{id:'H1',status:'supported',evidence:['Controlled fixture evidence'],reason:'Controlled fixture verifier output'}],patchDisposition:'accept',patchRisks:[],coverageGaps:[]},investigation);
 const fixtureCodex={...actualCodex,async runCodexInvestigation(){return {investigation,model:'fixture'};},async runCodexCausalVerification(){return {verification,model:'fixture'};}};
 const actualGit=localRequire('./git-context');let observations=0;const fixtureGit={...actualGit,collectGitContext(...args){if(++observations===failObservationAfter)throw Object.assign(new Error('Controlled incomplete Git inventory'),{code:'EGITINVENTORY'});return actualGit.collectGitContext(...args);}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,exports:mod.exports,Buffer,process,require:name=>name==='./codex'?fixtureCodex:name==='./git-context'?fixtureGit:localRequire(name)},{filename:file});
 return mod.exports;
}

test('cancelling verification after apply preserves a valid rollback session',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'debug-cancel-recovery-')),file=path.join(root,'value.txt'),marker=path.join(root,'verification-started');
 try{
  fs.writeFileSync(file,'before\n');execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['config','core.autocrlf','false'],{cwd:root});execFileSync('git',['add','value.txt'],{cwd:root});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture'],{cwd:root});
  const patch='diff --git a/value.txt b/value.txt\n--- a/value.txt\n+++ b/value.txt\n@@ -1 +1 @@\n-before\n+after\n';
  const debug=debugWithFixture(patch),cancellation=createCancellation(),script="require('node:fs').writeFileSync('verification-started','ready');setInterval(()=>{},1000)",command=`${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
  const pending=debug.runDebugSession({workspace:root,text:'fatal error: controlled fixture',apply:true,verifyCommand:command,cancellationToken:cancellation.token});
  for(let n=0;n<100&&!fs.existsSync(marker);n++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(fs.existsSync(marker),'verification must start after the patch was applied');cancellation.cancel();
  const result=await pending;assert.equal(result.fixStatus,'applied-unverified');assert.equal(result.verification.status,'interrupted');assert.equal(result.verification.interruption.code,'ECANCELLED');assert.equal(fs.readFileSync(file,'utf8'),'after\n');
  const stored=validateStoredSession(readSession(root,result.sessionId));assert.equal(stored.patch.snapshotId,result.patch.snapshotId);assert.ok(stored.ledger.entries.every(row=>row.status!=='confirmed'));
  const rollback=debug.rollbackDebugSession({workspace:root,sessionId:stored.sessionId});assert.equal(rollback.patch.rolledBack,true);assert.equal(fs.readFileSync(file,'utf8'),'before\n');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('stdin is cancellable and shares a finite read deadline',async()=>{
 const {PassThrough}=require('node:stream'),{readStdin}=require('../src/cli');
 const cancellation=createCancellation(),stream=new PassThrough(),pending=readStdin({stream,cancellationToken:cancellation.token,timeoutMs:1000});
 const rejection=assert.rejects(pending,error=>error.code==='ECANCELLED');cancellation.cancel();await rejection;
 await assert.rejects(()=>readStdin({stream:new PassThrough(),timeoutMs:20}),error=>error.code==='EDEBUGDEADLINE');
 await assert.rejects(()=>readStdin({stream:new PassThrough(),maxBytes:Infinity}),error=>error.code==='EEVIDENCELIMIT');
});


for(const action of ['run-apply','stored-apply','rollback'])test(`post-${action} Git observation failure retains a valid recovery receipt`,async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'debug-observation-recovery-')),file=path.join(root,'value.txt');
 try{
  fs.writeFileSync(file,'before\n');execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['config','core.autocrlf','false'],{cwd:root});execFileSync('git',['add','value.txt'],{cwd:root});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture'],{cwd:root});
  const patch='diff --git a/value.txt b/value.txt\n--- a/value.txt\n+++ b/value.txt\n@@ -1 +1 @@\n-before\n+after\n';
  const normal=debugWithFixture(patch),faulted=debugWithFixture(patch,{failObservationAfter:action==='run-apply'?3:2});let result;
  if(action==='run-apply'){
   const command=`${JSON.stringify(process.execPath)} -e "require('node:fs').writeFileSync('must-not-run','x')"`;
   result=await faulted.runDebugSession({workspace:root,text:'fatal error: fixture',apply:true,verifyCommand:command});
   assert.equal(fs.existsSync(path.join(root,'must-not-run')),false,'verification cannot continue with unavailable post-apply state');
  }else{
   const previous=await normal.runDebugSession({workspace:root,text:'fatal error: fixture',apply:action==='rollback'});
   result=action==='rollback'?faulted.rollbackDebugSession({workspace:root,sessionId:previous.sessionId}):await faulted.applyDebugSessionPatch({workspace:root,sessionId:previous.sessionId});
  }
  assert.equal(result.verification.status,'interrupted');assert.equal(result.verification.interruption.code,'EGITINVENTORY');assert.notEqual(result.fixStatus,'verified');
  const stored=validateStoredSession(readSession(root,result.sessionId));assert.equal(stored.patch.snapshotId,result.patch.snapshotId);assert.ok(stored.ledger.entries.every(row=>row.status!=='confirmed'));
  if(action==='rollback'){
   assert.equal(stored.patch.rolledBack,true);assert.equal(stored.lineage.rollback.afterStateFingerprint,'');assert.equal(fs.readFileSync(file,'utf8'),'before\n');
  }else{
   assert.equal(stored.fixStatus,'applied-unverified');assert.equal(stored.verification.mutationObserved,false);assert.equal(fs.readFileSync(file,'utf8'),'after\n');
   const rollback=normal.rollbackDebugSession({workspace:root,sessionId:stored.sessionId});assert.equal(rollback.patch.rolledBack,true);assert.equal(fs.readFileSync(file,'utf8'),'before\n');
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
