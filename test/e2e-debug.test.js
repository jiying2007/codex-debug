'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {runDebugSession,resumeDebugSession,applyDebugSessionPatch,rollbackDebugSession}=require('../src/debug');
const {createDebugReceipt,makeSessionId,validateStoredSession}=require('../src/contracts');
const {writeSession,readSession}=require('../src/session-store');

function init(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-e2e-'));
  execFileSync('git',['init','-q'],{cwd:dir});
  execFileSync('git',['config','user.name','fixture'],{cwd:dir});
  execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:dir});
  fs.writeFileSync(path.join(dir,'state.txt'),'bad\n');
  fs.writeFileSync(path.join(dir,'reproduce.js'),"const fs=require('node:fs');const bad=fs.readFileSync('state.txt','utf8').trim()==='bad';if(bad)console.error('fatal error: deterministic fixture');process.exit(bad?1:0);\n");
  execFileSync('git',['add','.'],{cwd:dir});
  execFileSync('git',['commit','-qm','fixture baseline'],{cwd:dir});
  return dir;
}
function patchText(){return 'diff --git a/state.txt b/state.txt\n--- a/state.txt\n+++ b/state.txt\n@@ -1 +1 @@\n-bad\n+good\n';}
function withFixturePatch(first,dir){
  const unifiedDiff=patchText();
  const investigation={...first.investigation,rootCause:'fixture state regression',confidence:.9,hypotheses:[{id:'H1',title:'fixture regression',claim:'bad state causes failure',status:'supported',evidenceFor:['fixture'],evidenceAgainst:[],causalAnchors:['state.txt'],verificationSteps:['run reproduce.js']}],patch:{summary:'fix fixture state',unifiedDiff,rationale:'fixture-only deterministic patch',risk:'low'},causalVerification:{rootCauseAssessment:'supported',confidence:.9,hypotheses:[{id:'H1',status:'supported',evidence:['fixture'],reason:'fixture'}],patchDisposition:'accept',patchRisks:[],coverageGaps:[]}};
  const patch={checked:true,applied:false,paths:['state.txt']};
  const fixStatus='proposed';
  const sessionId=makeSessionId(first.evidence.digest);
  const lineage={parentSessionId:first.sessionId,parentDebugFingerprint:first.receipt.debugFingerprint,proposedAt:new Date().toISOString()};
  const receipt=createDebugReceipt({sessionId,evidence:first.evidence,investigation,ledger:first.ledger,verification:first.verification,patchResult:patch,lineage,fixStatus,model:'fixture',codexVersion:''});
  const stored={...first,sessionId,fixStatus,investigation,patch,lineage,receipt};
  stored.sessionPath=writeSession(dir,stored);
  return stored;
}
function withUnauthorizedFixturePatch(first,dir){
  const unifiedDiff=patchText();
  const investigation={...first.investigation,rootCause:'unverified fixture guess',confidence:.4,patch:{summary:'unsafe guess',unifiedDiff,rationale:'no supported causal proof',risk:'high'},causalVerification:{rootCauseAssessment:'insufficient',confidence:.4,hypotheses:[],patchDisposition:'reject',patchRisks:['unsupported'],coverageGaps:['missing causal proof']}};
  const patch={checked:true,applied:false,paths:['state.txt']};
  const fixStatus='proposed';
  const sessionId=makeSessionId(first.evidence.digest);
  const lineage={parentSessionId:first.sessionId,parentDebugFingerprint:first.receipt.debugFingerprint,proposedAt:new Date().toISOString()};
  const receipt=createDebugReceipt({sessionId,evidence:first.evidence,investigation,ledger:first.ledger,verification:first.verification,patchResult:patch,lineage,fixStatus,model:'fixture',codexVersion:''});
  const stored={...first,sessionId,fixStatus,investigation,patch,lineage,receipt};
  writeSession(dir,stored);
  return stored;
}

test('observed failing baseline plus manual mutation plus resumed green runs verifies fix without inventing root-cause confirmation',async()=>{
  const dir=init();
  try{
    const first=await runDebugSession({workspace:dir,command:'node reproduce.js',reproRuns:2,deterministicOnly:true,persist:true});
    assert.equal(first.evidence.reproduction.failures,2);
    assert.equal(first.evidence.reproduction.reproducibleFailure,true);
    assert.notEqual(first.fixStatus,'verified');
    assert.ok(first.sessionPath);
    fs.writeFileSync(path.join(dir,'state.txt'),'good\n');
    const resumed=await resumeDebugSession({workspace:dir,resume:first.sessionId,verifyCommand:'node reproduce.js',verifyRuns:3,persist:true});
    assert.equal(resumed.verification.status,'passed');
    assert.equal(resumed.verification.failureTransition.status,'resolved');
    assert.equal(resumed.verification.mutationObserved,true);
    assert.equal(resumed.verification.afterSummary.passes,3);
    assert.equal(resumed.fixStatus,'verified');
    assert.equal(resumed.lineage.parentSessionId,first.sessionId);
    assert.equal(resumed.ledger.entries.some(h=>h.status==='confirmed'),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('verified applied patch rolls back into a new receipt-bound proposed child and cannot consume snapshot twice',async()=>{
  const dir=init();
  try{
    const target=path.join(dir,'state.txt');
    const first=await runDebugSession({workspace:dir,command:'node reproduce.js',reproRuns:2,deterministicOnly:true,persist:true});
    const before=fs.readFileSync(target);
    const proposed=withFixturePatch(first,dir);
    const applied=await applyDebugSessionPatch({workspace:dir,sessionId:proposed.sessionId});
    assert.equal(applied.fixStatus,'applied-unverified');
    assert.equal(applied.lineage.parentSessionId,proposed.sessionId);
    assert.ok(applied.patch.snapshotId);
    assert.equal(fs.readFileSync(target,'utf8').trim(),'good');

    const verified=await resumeDebugSession({workspace:dir,resume:applied.sessionId,verifyCommand:'node reproduce.js',verifyRuns:2,persist:true});
    assert.equal(verified.fixStatus,'verified');
    assert.equal(verified.verification.status,'passed');

    const rolled=rollbackDebugSession({workspace:dir,sessionId:verified.sessionId});
    assert.notEqual(rolled.sessionId,verified.sessionId);
    assert.equal(rolled.lineage.parentSessionId,verified.sessionId);
    assert.equal(rolled.lineage.parentDebugFingerprint,verified.receipt.debugFingerprint);
    assert.equal(rolled.lineage.rollback.kind,'workspace-rollback');
    assert.equal(rolled.lineage.rollback.snapshotId,applied.patch.snapshotId);
    assert.equal(rolled.lineage.rollback.rollbackDigest,rolled.patch.rollbackDigest);
    assert.equal(rolled.patch.rolledBack,true);
    assert.equal(rolled.patch.applied,false);
    assert.equal(rolled.verification.rollbackObserved,true);
    assert.equal(rolled.verification.rollbackDigest,rolled.patch.rollbackDigest);
    assert.equal(rolled.fixStatus,'proposed','rollback must not inherit verified/applied state');
    assert.deepEqual(fs.readFileSync(target),before);
    assert.ok(rolled.sessionPath);

    const persisted=validateStoredSession(readSession(dir,rolled.sessionId));
    assert.equal(persisted.receipt.sessionId,rolled.sessionId);
    assert.equal(persisted.receipt.lineageDigest,rolled.receipt.lineageDigest);
    assert.equal(persisted.receipt.patchStateDigest,rolled.receipt.patchStateDigest);
    assert.throws(()=>rollbackDebugSession({workspace:dir,sessionId:rolled.sessionId}),error=>error?.code==='EROLLBACKCONSUMED');

    const raw=readSession(dir,rolled.sessionId);
    const tampered={...raw,lineage:{...raw.lineage,rollback:{...raw.lineage.rollback,rollbackDigest:'0'.repeat(64)}}};
    assert.throws(()=>validateStoredSession(tampered),error=>error?.code==='EDEBUGSESSIONBINDING'||error?.code==='EDEBUGROLLBACKBINDING');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('rollback refuses post-apply drift and does not create a false rollback child',async()=>{
  const dir=init();
  try{
    const target=path.join(dir,'state.txt');
    const first=await runDebugSession({workspace:dir,command:'node reproduce.js',reproRuns:2,deterministicOnly:true,persist:true});
    const proposed=withFixturePatch(first,dir);
    const applied=await applyDebugSessionPatch({workspace:dir,sessionId:proposed.sessionId});
    fs.writeFileSync(target,'manual\n');
    assert.throws(()=>rollbackDebugSession({workspace:dir,sessionId:applied.sessionId}),/workspace drifted after patch/);
    assert.equal(fs.readFileSync(target,'utf8').trim(),'manual');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('apply entrypoint rejects a receipt-valid patch without supported causal authorization',async()=>{
  const dir=init();
  try{
    const target=path.join(dir,'state.txt');
    const first=await runDebugSession({workspace:dir,command:'node reproduce.js',reproRuns:2,deterministicOnly:true,persist:true});
    const unauthorized=withUnauthorizedFixturePatch(first,dir);
    await assert.rejects(()=>applyDebugSessionPatch({workspace:dir,sessionId:unauthorized.sessionId}),error=>error?.code==='EDEBUGPATCHAUTH');
    assert.equal(fs.readFileSync(target,'utf8').trim(),'bad');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
