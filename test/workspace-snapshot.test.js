'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {createWorkspaceSnapshot,finalizeWorkspaceSnapshot,writeWorkspaceSnapshot,rollbackWorkspaceSnapshot}=require('../src/workspace-snapshot');
test('snapshot rolls back unchanged post-patch files and refuses drift',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-snapshot-'));try{fs.writeFileSync(path.join(root,'a.txt'),'before');const snap=createWorkspaceSnapshot(root,['a.txt','new.txt']);fs.writeFileSync(path.join(root,'a.txt'),'after');fs.writeFileSync(path.join(root,'new.txt'),'new');const final=finalizeWorkspaceSnapshot(root,snap);writeWorkspaceSnapshot(root,final);const result=rollbackWorkspaceSnapshot(root,final.snapshotId,{snapshotDigest:final.digest,paths:final.paths});assert.equal(result.rolledBack,true);assert.equal(fs.readFileSync(path.join(root,'a.txt'),'utf8'),'before');assert.equal(fs.existsSync(path.join(root,'new.txt')),false);fs.writeFileSync(path.join(root,'a.txt'),'after');const snap2=createWorkspaceSnapshot(root,['a.txt']);fs.writeFileSync(path.join(root,'a.txt'),'patched');const final2=finalizeWorkspaceSnapshot(root,snap2);writeWorkspaceSnapshot(root,final2);fs.writeFileSync(path.join(root,'a.txt'),'user-edit');assert.throws(()=>rollbackWorkspaceSnapshot(root,final2.snapshotId,{snapshotDigest:final2.digest,paths:final2.paths}),/workspace drifted/);assert.equal(fs.readFileSync(path.join(root,'a.txt'),'utf8'),'user-edit');}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('snapshot rejects hard-linked files so patch paths cannot mutate unlisted aliases',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-hardlink-'));try{fs.writeFileSync(path.join(root,'a.txt'),'same inode');fs.linkSync(path.join(root,'a.txt'),path.join(root,'alias.txt'));assert.throws(()=>createWorkspaceSnapshot(root,['a.txt']),/multiple hard links/);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('rollback requires the exact Receipt digest and path set before any restore',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-bound-snapshot-'));
  try{
    fs.writeFileSync(path.join(root,'a.txt'),'before');
    const before=createWorkspaceSnapshot(root,['a.txt']);fs.writeFileSync(path.join(root,'a.txt'),'after');
    const snapshot=finalizeWorkspaceSnapshot(root,before);writeWorkspaceSnapshot(root,snapshot);
    for(const binding of [{},{snapshotDigest:'0'.repeat(64),paths:snapshot.paths},{snapshotDigest:snapshot.digest,paths:['other.txt']}]){
      assert.throws(()=>rollbackWorkspaceSnapshot(root,snapshot.snapshotId,binding),error=>error.code==='ESNAPSHOTBINDING');
      assert.equal(fs.readFileSync(path.join(root,'a.txt'),'utf8'),'after');
    }
    assert.equal(fs.existsSync(path.join(root,'.codex-debug','snapshots','staging')),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('snapshot restore bytes and before/after paths must match their declared identities',()=>{
  const {stableDigest}=require('../src/contracts'),{validateSnapshot}=require('../src/workspace-snapshot');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-snapshot-format-'));
  try{
    fs.writeFileSync(path.join(root,'a.txt'),'before');const before=createWorkspaceSnapshot(root,['a.txt']);fs.writeFileSync(path.join(root,'a.txt'),'after');const snapshot=finalizeWorkspaceSnapshot(root,before);
    for(const mutate of [
      value=>{value.before[0].contentBase64=Buffer.from('other!').toString('base64');},
      value=>{value.before[0].path='other.txt';},
      value=>{value.after[0].path='other.txt';},
      value=>{value.paths.push(value.paths[0]);},
      value=>{value.before[0].size++;}
    ]){
      const changed=JSON.parse(JSON.stringify(snapshot));mutate(changed);delete changed.digest;changed.digest=stableDigest(changed);
      assert.throws(()=>validateSnapshot(changed),error=>error.code==='ESNAPSHOTFORMAT');
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('snapshot rejects paths that traverse a symlinked parent directory',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-symlink-')),outside=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-outside-'));try{fs.writeFileSync(path.join(outside,'external.txt'),'outside');try{fs.symlinkSync(outside,path.join(root,'linked'),process.platform==='win32'?'junction':'dir');}catch(error){if(process.platform==='win32'&&(error.code==='EPERM'||error.code==='EACCES')){t.skip('Windows runner does not permit symlink/junction creation');return;}throw error;}assert.throws(()=>createWorkspaceSnapshot(root,['linked/external.txt']),/symbolic-link parent/);assert.equal(fs.readFileSync(path.join(outside,'external.txt'),'utf8'),'outside');}finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}});

test('snapshot storage cannot follow an external snapshots directory symlink or junction',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-storage-'));
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-external-'));
  try{
    fs.writeFileSync(path.join(root,'a.txt'),'before');
    fs.writeFileSync(path.join(outside,'sentinel'),'untouched');
    const parent=path.join(root,'.codex-debug');fs.mkdirSync(parent);
    try{fs.symlinkSync(outside,path.join(parent,'snapshots'),process.platform==='win32'?'junction':'dir');}
    catch(error){if(process.platform==='win32'&&['EPERM','EACCES'].includes(error.code)){t.skip('Windows symlink privileges unavailable');return;}throw error;}
    const snap=createWorkspaceSnapshot(root,['a.txt']);fs.writeFileSync(path.join(root,'a.txt'),'after');
    const finalized=finalizeWorkspaceSnapshot(root,snap);
    assert.throws(()=>writeWorkspaceSnapshot(root,finalized),error=>error.code==='ESNAPSHOTBOUNDARY');
    assert.equal(fs.readFileSync(path.join(outside,'sentinel'),'utf8'),'untouched');
    assert.equal(fs.existsSync(path.join(outside,`${finalized.snapshotId}.json`)),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
});
test('rollback rejects an external staging symlink before cleanup',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-stage-'));
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-external-stage-'));
  try{
    fs.writeFileSync(path.join(root,'a.txt'),'before');
    const snap=createWorkspaceSnapshot(root,['a.txt']);fs.writeFileSync(path.join(root,'a.txt'),'patched');
    const finalized=finalizeWorkspaceSnapshot(root,snap);writeWorkspaceSnapshot(root,finalized);
    fs.writeFileSync(path.join(outside,'sentinel'),'must-stay');
    try{fs.symlinkSync(outside,path.join(root,'.codex-debug','snapshots','staging'),process.platform==='win32'?'junction':'dir');}
    catch(error){if(process.platform==='win32'&&['EPERM','EACCES'].includes(error.code)){t.skip('Windows symlink privileges unavailable');return;}throw error;}
    assert.throws(()=>rollbackWorkspaceSnapshot(root,finalized.snapshotId,{snapshotDigest:finalized.digest,paths:finalized.paths}),error=>error.code==='ESNAPSHOTBOUNDARY');
    assert.equal(fs.readFileSync(path.join(outside,'sentinel'),'utf8'),'must-stay');
    assert.equal(fs.readFileSync(path.join(root,'a.txt'),'utf8'),'patched');
  }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
});

for(const alias of ['hardlink','symlink']){
 test('rollback replacement cannot overwrite an external '+alias+' swapped at the final write boundary',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-atomic-restore-'));
  const outsideDir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-alias-'));
  const file=path.join(root,'a.txt'),outside=path.join(outsideDir,'sentinel.txt');
  const aliasAt=target=>alias==='hardlink'?fs.linkSync(outside,target):fs.symlinkSync(outside,target,'file');
  try{
   fs.writeFileSync(file,'before');
   fs.writeFileSync(outside,'external must remain intact');
   const probe=path.join(root,'probe-link');
   try{aliasAt(probe);fs.unlinkSync(probe);}catch(error){
    if(['EPERM','EACCES','ENOTSUP','EOPNOTSUPP'].includes(error.code)){t.skip('This runner cannot create '+alias+' aliases');return;}
    throw error;
   }
   const before=createWorkspaceSnapshot(root,['a.txt']);
   fs.writeFileSync(file,'after');
   const snapshot=finalizeWorkspaceSnapshot(root,before);
   writeWorkspaceSnapshot(root,snapshot);
   const copy=fs.copyFileSync,rename=fs.renameSync;
   let injected=false;
   const inject=dest=>{
    if(injected||dest!==file)return;
    injected=true;fs.unlinkSync(file);aliasAt(file);
   };
   fs.copyFileSync=function(from,to,...args){inject(to);return copy.call(this,from,to,...args);};
   fs.renameSync=function(from,to,...args){inject(to);return rename.call(this,from,to,...args);};
   try{
    const rolled=rollbackWorkspaceSnapshot(root,snapshot.snapshotId,{snapshotDigest:snapshot.digest,paths:snapshot.paths});
    assert.equal(rolled.rolledBack,true);
   }finally{fs.copyFileSync=copy;fs.renameSync=rename;}
   assert.equal(injected,true,'the race must exercise the final filesystem write');
   assert.equal(fs.readFileSync(file,'utf8'),'before');
   assert.equal(fs.readFileSync(outside,'utf8'),'external must remain intact');
   assert.equal(fs.lstatSync(file).isSymbolicLink(),false);
   assert.equal(fs.statSync(file).nlink,1);
  }finally{fs.rmSync(root,{force:true,recursive:true});fs.rmSync(outsideDir,{force:true,recursive:true});}
 });
}
