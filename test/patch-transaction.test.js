'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');const {applyPatchWithSnapshot}=require('../src/patch-transaction');const {rollbackWorkspaceSnapshot}=require('../src/workspace-snapshot');
test('checked patch transaction creates rollback snapshot',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-patch-tx-'));try{execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['config','user.name','fixture'],{cwd:root});execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:root});const target=path.join(root,'a.txt');fs.writeFileSync(target,'one\n');execFileSync('git',['add','a.txt'],{cwd:root});execFileSync('git',['commit','-qm','init'],{cwd:root});const before=fs.readFileSync(target),patch='diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-one\n+two\n',result=applyPatchWithSnapshot(patch,{root});assert.equal(result.applied,true);assert.match(result.snapshotId,/^snap-/);assert.equal(fs.readFileSync(target,'utf8').trim(),'two');rollbackWorkspaceSnapshot(root,result.snapshotId,{snapshotDigest:result.snapshotDigest,paths:result.paths});assert.deepEqual(fs.readFileSync(target),before);}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('POSIX literal backslash and directory separator paths stay distinct through apply and rollback',{skip:process.platform==='win32'},()=>{
 const {execFileSync}=require('node:child_process');const {collectGitContext}=require('../src/git-context');
 const {rollbackWorkspaceSnapshot}=require('../src/workspace-snapshot');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debug-raw-path-'));
 try{
   execFileSync('git',['init','-q'],{cwd:dir});execFileSync('git',['config','user.name','fixture'],{cwd:dir});execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:dir});
   fs.mkdirSync(path.join(dir,'x'));fs.writeFileSync(path.join(dir,'x\\y.c'),'literal-before\n');fs.writeFileSync(path.join(dir,'x/y.c'),'directory-before\n');
   execFileSync('git',['add','.'],{cwd:dir});execFileSync('git',['commit','-qm','paths'],{cwd:dir});
   fs.writeFileSync(path.join(dir,'x\\y.c'),'literal-after\n');
   const patch=execFileSync('git',['diff','--','x\\y.c'],{cwd:dir,encoding:'utf8'});
   assert.deepEqual(collectGitContext(dir,{includeHistory:false}).changedPaths,['x\\y.c']);
   fs.writeFileSync(path.join(dir,'x\\y.c'),'literal-before\n');
   const applied=applyPatchWithSnapshot(patch,{root:dir});
   assert.deepEqual(applied.paths,['x\\y.c']);
   assert.equal(fs.readFileSync(path.join(dir,'x\\y.c'),'utf8'),'literal-after\n');
   assert.equal(fs.readFileSync(path.join(dir,'x/y.c'),'utf8'),'directory-before\n');
   const rolled=rollbackWorkspaceSnapshot(dir,applied.snapshotId,{snapshotDigest:applied.snapshotDigest,paths:applied.paths});
   assert.deepEqual(rolled.paths,['x\\y.c']);
   assert.equal(fs.readFileSync(path.join(dir,'x\\y.c'),'utf8'),'literal-before\n');
   assert.equal(fs.readFileSync(path.join(dir,'x/y.c'),'utf8'),'directory-before\n');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
