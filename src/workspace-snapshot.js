'use strict';
const fs=require('node:fs');const path=require('node:path');const {stableDigest,freeze}=require('./contracts');
function verifiedDirectory(parent,name,create=false){
  const dir=path.join(parent,name);
  if(create){try{fs.mkdirSync(dir,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}}
  const stat=fs.lstatSync(dir);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Object.assign(new Error(`Unsafe snapshot storage directory: ${dir}`),{code:'ESNAPSHOTBOUNDARY'});
  return dir;
}
function snapshotDirectory(root,{create=false}={}){
  const base=realRoot(root);
  const privateRoot=verifiedDirectory(base,'.codex-debug',create);
  return verifiedDirectory(privateRoot,'snapshots',create);
}
function stagingDirectory(root,create=false){return verifiedDirectory(snapshotDirectory(root,{create}),'staging',create);}
function cleanupStaging(root,staging){
  const base=stagingDirectory(root);
  if(path.dirname(staging)!==base)throw Object.assign(new Error('Snapshot staging path escaped its private directory.'),{code:'ESNAPSHOTBOUNDARY'});
  const stat=fs.lstatSync(staging);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Object.assign(new Error('Snapshot staging directory was replaced.'),{code:'ESNAPSHOTBOUNDARY'});
  fs.rmSync(staging,{recursive:true,force:true});
}
function safeSnapshotId(value){const id=String(value||'');if(!/^snap-[0-9a-f]{16}$/.test(id))throw Object.assign(new Error('Invalid workspace snapshot id.'),{code:'ESNAPSHOTID'});return id;}
function realRoot(root){const absolute=path.resolve(root);try{return fs.realpathSync(absolute);}catch(error){throw Object.assign(new Error(`Workspace snapshot root is unavailable: ${error.message}`),{code:'ESNAPSHOTROOT'});}}
function assertNoSymlinkParents(root,relative){let cursor=root;const parts=String(relative||'').split('/').filter(Boolean);for(const part of parts.slice(0,-1)){cursor=path.join(cursor,part);let stat;try{stat=fs.lstatSync(cursor);}catch(error){if(error.code==='ENOENT')break;throw error;}if(stat.isSymbolicLink())throw Object.assign(new Error(`Snapshot path traverses a symbolic-link parent: ${relative}`),{code:'ESNAPSHOTSYMLINK'});if(!stat.isDirectory())throw Object.assign(new Error(`Snapshot parent is not a directory: ${relative}`),{code:'ESNAPSHOTTYPE'});}}
function safePath(root,file){const base=realRoot(root),normalized=String(file||'').replace(/\\/g,'/'),absolute=path.resolve(base,normalized),relative=path.relative(base,absolute).replace(/\\/g,'/');if(!normalized||relative.startsWith('../')||relative==='..'||path.isAbsolute(relative)||relative==='.git'||relative.startsWith('.git/')||relative==='.codex-debug'||relative.startsWith('.codex-debug/'))throw Object.assign(new Error(`Unsafe snapshot path: ${file}`),{code:'ESNAPSHOTPATH'});assertNoSymlinkParents(base,relative);return {root:base,path:relative,absolute};}
function captureState(root,file,{includeContent=false,maxFileBytes=2*1024*1024}={}){const target=safePath(root,file);let stat;try{stat=fs.lstatSync(target.absolute);}catch(error){if(error.code==='ENOENT')return freeze({path:target.path,exists:false});throw error;}if(stat.isSymbolicLink()||!stat.isFile())throw Object.assign(new Error(`Snapshot path is not a regular file: ${target.path}`),{code:'ESNAPSHOTTYPE'});if(Number(stat.nlink||1)>1)throw Object.assign(new Error(`Snapshot path has multiple hard links and may alias an unlisted file: ${target.path}`),{code:'ESNAPSHOTHARDLINK'});if(stat.size>maxFileBytes)throw Object.assign(new Error(`Snapshot file exceeds ${maxFileBytes} bytes: ${target.path}`),{code:'ESNAPSHOTLIMIT'});const content=fs.readFileSync(target.absolute),state={path:target.path,exists:true,size:content.length,mode:stat.mode&0o777,hash:stableDigest(content.toString('base64'))};if(includeContent)state.contentBase64=content.toString('base64');return freeze(state);}
function identity(state){return state?.exists?{path:state.path,exists:true,size:state.size,mode:state.mode,hash:state.hash}:{path:state.path,exists:false};}
function sameIdentity(a,b){return stableDigest(identity(a))===stableDigest(identity(b));}
function createWorkspaceSnapshot(root,paths,{maxTotalBytes=8*1024*1024,maxFileBytes=2*1024*1024}={}){const base=realRoot(root),unique=[...new Set((paths||[]).map(v=>String(v).replace(/\\/g,'/')).filter(Boolean))].sort();if(!unique.length)throw Object.assign(new Error('Workspace snapshot requires patch paths.'),{code:'ESNAPSHOTEMPTY'});const before=unique.map(file=>captureState(base,file,{includeContent:true,maxFileBytes})),total=before.reduce((n,s)=>n+(s.size||0),0);if(total>maxTotalBytes)throw Object.assign(new Error(`Workspace snapshot exceeds ${maxTotalBytes} bytes.`),{code:'ESNAPSHOTTOTAL'});const createdAt=new Date().toISOString(),snapshotId=`snap-${stableDigest({root:base,paths:unique,before:before.map(identity),createdAt}).slice(0,16)}`,payload={schemaVersion:1,snapshotId,paths:unique,before,createdAt};return freeze({...payload,digest:stableDigest(payload)});}
function finalizeWorkspaceSnapshot(root,snapshot,{maxFileBytes=2*1024*1024}={}){safeSnapshotId(snapshot?.snapshotId);const after=snapshot.paths.map(file=>captureState(root,file,{includeContent:false,maxFileBytes})),payload={...snapshot,after,finalizedAt:new Date().toISOString()};delete payload.digest;return freeze({...payload,digest:stableDigest(payload)});}
function pathSet(paths){
  if(!Array.isArray(paths)||!paths.length||paths.some(file=>typeof file!=='string'||!file||file==='.'||file.includes('\\')||path.posix.isAbsolute(file)||path.win32.isAbsolute(file)||path.posix.normalize(file)!==file||file==='..'||file.startsWith('../')))throw Object.assign(new Error('Workspace snapshot path set is invalid.'),{code:'ESNAPSHOTFORMAT'});
  const unique=[...new Set(paths)].sort();
  if(unique.length!==paths.length)throw Object.assign(new Error('Workspace snapshot path set contains duplicates.'),{code:'ESNAPSHOTFORMAT'});
  return unique;
}
function validateSnapshot(snapshot){
  safeSnapshotId(snapshot?.snapshotId);
  const copy={...snapshot};delete copy.digest;
  if(!/^[0-9a-f]{64}$/.test(String(snapshot.digest||''))||stableDigest(copy)!==snapshot.digest)throw Object.assign(new Error('Workspace snapshot digest mismatch.'),{code:'ESNAPSHOTDIGEST'});
  if(snapshot.schemaVersion!==1||!Array.isArray(snapshot.before)||!Array.isArray(snapshot.after))throw Object.assign(new Error('Workspace snapshot is incomplete.'),{code:'ESNAPSHOTFORMAT'});
  const paths=pathSet(snapshot.paths);
  for(const [kind,states] of [['before',snapshot.before],['after',snapshot.after]]){
    if(stableDigest(pathSet(states.map(state=>state?.path)))!==stableDigest(paths))throw Object.assign(new Error('Workspace snapshot before/after path sets do not match.'),{code:'ESNAPSHOTFORMAT'});
    for(const state of states){
      if(typeof state.exists!=='boolean')throw Object.assign(new Error('Workspace snapshot file identity is invalid.'),{code:'ESNAPSHOTFORMAT'});
      if(!state.exists){if(state.contentBase64!==undefined)throw Object.assign(new Error('Absent snapshot paths must not contain restore bytes.'),{code:'ESNAPSHOTFORMAT'});continue;}
      if(!Number.isSafeInteger(state.size)||state.size<0||!Number.isInteger(state.mode)||state.mode<0||state.mode>0o777||!/^[0-9a-f]{64}$/.test(String(state.hash||'')))throw Object.assign(new Error('Workspace snapshot file identity is invalid.'),{code:'ESNAPSHOTFORMAT'});
      if(kind==='before'){
        if(typeof state.contentBase64!=='string')throw Object.assign(new Error('Workspace snapshot restore bytes are missing.'),{code:'ESNAPSHOTFORMAT'});
        const content=Buffer.from(state.contentBase64,'base64');
        if(content.toString('base64')!==state.contentBase64||content.length!==state.size||stableDigest(state.contentBase64)!==state.hash)throw Object.assign(new Error('Workspace snapshot restore bytes do not match the original identity.'),{code:'ESNAPSHOTFORMAT'});
      }
    }
  }
  return freeze(snapshot);
}
function writeWorkspaceSnapshot(root,snapshot){
  const value=validateSnapshot(snapshot),dir=snapshotDirectory(root,{create:true});
  const target=path.join(dir,`${value.snapshotId}.json`);
  const temp=path.join(dir,`${value.snapshotId}.${process.pid}.${require('node:crypto').randomBytes(8).toString('hex')}.tmp`);
  try{fs.writeFileSync(temp,`${JSON.stringify(value,null,2)}\n`,{encoding:'utf8',mode:0o600,flag:'wx'});snapshotDirectory(root);fs.renameSync(temp,target);}
  finally{try{fs.unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}
  return target;
}
function readWorkspaceSnapshot(root,snapshotId){
  const expected=safeSnapshotId(snapshotId),file=path.join(snapshotDirectory(root),`${expected}.json`);
  const entry=fs.lstatSync(file);
  if(entry.isSymbolicLink()||!entry.isFile())throw Object.assign(new Error('Snapshot metadata file is not a regular file.'),{code:'ESNAPSHOTBOUNDARY'});
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  let raw;
  try{
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||Number(stat.nlink||1)!==1||stat.size>16*1024*1024||stat.ino!==entry.ino||stat.dev!==entry.dev)throw Object.assign(new Error('Unsafe snapshot storage file.'),{code:'ESNAPSHOTBOUNDARY'});
    raw=fs.readFileSync(fd,'utf8');
  }finally{fs.closeSync(fd);}
  const snapshot=validateSnapshot(JSON.parse(raw));
  if(snapshot.snapshotId!==expected)throw Object.assign(new Error('Workspace snapshot id does not match the requested snapshot.'),{code:'ESNAPSHOTBINDING'});
  return snapshot;
}
function prepareRestore(root,snapshot){const staging=fs.mkdtempSync(path.join(stagingDirectory(root,true),`${snapshot.snapshotId}-`));const prepared=[];try{for(let index=0;index<snapshot.before.length;index++){const state=snapshot.before[index],target=safePath(root,state.path);if(state.exists){const currentExists=fs.existsSync(target.absolute);if(currentExists)captureState(root,state.path,{includeContent:false});fs.mkdirSync(path.dirname(target.absolute),{recursive:true});const temp=path.join(staging,`${String(index).padStart(4,'0')}.bin`);fs.writeFileSync(temp,Buffer.from(state.contentBase64,'base64'),{mode:0o600});prepared.push({state,target,temp});}else prepared.push({state,target,temp:null});}return {staging,prepared};}catch(error){cleanupStaging(root,staging);throw error;}}
function restoreBeforeUnchecked(root,snapshot){const {staging,prepared}=prepareRestore(root,snapshot),failures=[];try{for(const item of prepared){try{const {state,target,temp}=item;if(!state.exists){try{const stat=fs.lstatSync(target.absolute);if(stat.isSymbolicLink()||!stat.isFile()||Number(stat.nlink||1)>1)throw new Error(`Cannot remove unsafe rollback target: ${state.path}`);fs.unlinkSync(target.absolute);}catch(error){if(error.code!=='ENOENT')throw error;}continue;}if(fs.existsSync(target.absolute))captureState(root,state.path,{includeContent:false});fs.copyFileSync(temp,target.absolute);try{fs.chmodSync(target.absolute,state.mode);}catch{}}catch(error){failures.push({path:item.state.path,error:String(error.message||error)});}}}finally{cleanupStaging(root,staging);}if(failures.length){const error=Object.assign(new Error(`Rollback restore was partial for ${failures.map(v=>v.path).join(', ')}`),{code:'EROLLBACKPARTIAL',failures});throw error;}}
function rollbackWorkspaceSnapshot(root,snapshotId,{snapshotDigest,paths}={}){
  const snapshot=readWorkspaceSnapshot(root,snapshotId);
  if(!/^[0-9a-f]{64}$/.test(String(snapshotDigest||''))||snapshot.digest!==snapshotDigest||stableDigest(pathSet(paths))!==stableDigest(pathSet(snapshot.paths)))throw Object.assign(new Error('Workspace snapshot does not match the Receipt-bound digest and patch paths.'),{code:'ESNAPSHOTBINDING'});
for(const expected of snapshot.after){const current=captureState(root,expected.path,{includeContent:false});if(!sameIdentity(current,expected))throw Object.assign(new Error(`Rollback refused because workspace drifted after patch: ${expected.path}`),{code:'EROLLBACKDRIFT'});}restoreBeforeUnchecked(root,snapshot);for(const expected of snapshot.before){const current=captureState(root,expected.path,{includeContent:false});if(!sameIdentity(current,expected))throw Object.assign(new Error(`Rollback verification failed: ${expected.path}`),{code:'EROLLBACKVERIFY'});}return freeze({snapshotId:snapshot.snapshotId,rolledBack:true,paths:snapshot.paths,digest:stableDigest({snapshotId:snapshot.snapshotId,paths:snapshot.paths,rolledBack:true})});}
module.exports={snapshotDirectory,safeSnapshotId,realRoot,assertNoSymlinkParents,safePath,captureState,identity,sameIdentity,createWorkspaceSnapshot,finalizeWorkspaceSnapshot,pathSet,validateSnapshot,writeWorkspaceSnapshot,readWorkspaceSnapshot,prepareRestore,restoreBeforeUnchecked,rollbackWorkspaceSnapshot};
