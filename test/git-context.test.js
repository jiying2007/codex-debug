'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');const {parsePorcelainZ,collectGitContext}=require('../src/git-context');
function repo(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-state-'));execFileSync('git',['init','-q'],{cwd:dir});execFileSync('git',['config','user.name','fixture'],{cwd:dir});execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:dir});fs.writeFileSync(path.join(dir,'a.txt'),'one');execFileSync('git',['add','a.txt'],{cwd:dir});execFileSync('git',['commit','-qm','init'],{cwd:dir});return dir;}
test('NUL porcelain parsing preserves spaces unicode and rename destination',()=>{const rows=parsePorcelainZ(' M file with space.txt\0?? 中文.txt\0R  new name.txt\0old name.txt\0');assert.deepEqual(rows.map(x=>x.path),['file with space.txt','中文.txt','new name.txt']);assert.deepEqual(rows.map(x=>x.xy),[' M','??','R ']);});
test('workspace state fingerprint changes with tracked content mutation',()=>{const dir=repo();try{const a=collectGitContext(dir,{includeHistory:false});fs.writeFileSync(path.join(dir,'a.txt'),'two');const b=collectGitContext(dir,{includeHistory:false});assert.notEqual(a.stateFingerprint,b.stateFingerprint);assert.deepEqual(b.changedPaths,['a.txt']);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('workspace freshness tracks unicode and spaced paths without quoted-path ambiguity',()=>{const dir=repo();try{const a=collectGitContext(dir,{includeHistory:false}),spaced='with space.txt',unicode='中文.txt';fs.writeFileSync(path.join(dir,spaced),'one');fs.writeFileSync(path.join(dir,unicode),'一');const b=collectGitContext(dir,{includeHistory:false});assert.ok(b.changedPaths.includes(spaced));assert.ok(b.changedPaths.includes(unicode));assert.notEqual(a.stateFingerprint,b.stateFingerprint);fs.writeFileSync(path.join(dir,unicode),'二');const c=collectGitContext(dir,{includeHistory:false});assert.notEqual(b.stateFingerprint,c.stateFingerprint);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('private .codex-debug state does not invalidate workspace freshness',()=>{const dir=repo();try{const a=collectGitContext(dir,{includeHistory:false});fs.mkdirSync(path.join(dir,'.codex-debug','sessions'),{recursive:true});fs.writeFileSync(path.join(dir,'.codex-debug','sessions','x.json'),'{}');const b=collectGitContext(dir,{includeHistory:false});assert.equal(a.stateFingerprint,b.stateFingerprint);assert.equal(b.dirty,false);assert.deepEqual(b.changedPaths,[]);fs.writeFileSync(path.join(dir,'a.txt'),'two');const c=collectGitContext(dir,{includeHistory:false});assert.notEqual(a.stateFingerprint,c.stateFingerprint);assert.deepEqual(c.changedPaths,['a.txt']);}finally{fs.rmSync(dir,{recursive:true,force:true});}});


test('Git inventories reject invalid UTF-8 and truncated records while preserving literal BOM names',()=>{
 const {decodeGitNulRecords}=require('../src/git-context');
 assert.deepEqual(decodeGitNulRecords(Buffer.from('\uFEFFname.txt\0')),['\uFEFFname.txt']);
 for(const bytes of [Buffer.from([0xff,0]),Buffer.from('unterminated'),Buffer.from('one\0\0')])assert.throws(()=>decodeGitNulRecords(bytes),error=>error.code==='EGITINVENTORY');
 assert.throws(()=>parsePorcelainZ(Buffer.concat([Buffer.from('?? bad-'),Buffer.from([0xff,0])])),error=>error.code==='EGITINVENTORY');
 assert.throws(()=>parsePorcelainZ(Buffer.from('R  destination\0')),error=>error.code==='EGITINVENTORY');
});
test('a Git status or path-list failure cannot turn a known repository into a clean empty inventory',()=>{
 const {gitFiles}=require('../src/test-selection'),dir=repo();
 try{fs.writeFileSync(path.join(dir,'.git','index'),'broken-index');assert.throws(()=>collectGitContext(dir,{includeHistory:false}),error=>error.code==='EGITINVENTORY');assert.throws(()=>gitFiles(dir),error=>error.code==='EGITINVENTORY');}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('real unsupported byte names never alias a replacement-character Git path',{skip:process.platform!=='linux'},()=>{
 const {gitFiles}=require('../src/test-selection'),dir=repo();
 try{const bad=Buffer.concat([Buffer.from(dir+path.sep+'bad-'),Buffer.from([0xff]),Buffer.from('.txt')]);fs.writeFileSync(bad,'unsupported');fs.writeFileSync(path.join(dir,'bad-\uFFFD.txt'),'valid UTF-8');assert.throws(()=>collectGitContext(dir,{includeHistory:false}),error=>error.code==='EGITINVENTORY');execFileSync('git',['add','--all'],{cwd:dir});assert.throws(()=>gitFiles(dir),error=>error.code==='EGITINVENTORY');}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});


test('root path records preserve edge whitespace and reject unsupported bytes or multiline paths',()=>{
 const {decodeGitPathLine}=require('../src/git-context');
 assert.equal(decodeGitPathLine(Buffer.from('\uFEFFroot \\name \n')),'\uFEFFroot \\name ');
 for(const raw of [Buffer.from([0xff,10]),Buffer.from('/tmp/no-terminator'),Buffer.from('/tmp/two\nlines\n')])assert.throws(()=>decodeGitPathLine(raw),error=>error.code==='EGITINVENTORY');
});

test('a selected repository with trailing whitespace cannot alias its neighboring repository',{skip:process.platform==='win32'},()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'debug-root-identity-')),neighbor=path.join(parent,'repo'),selected=path.join(parent,'repo ');
 try{
  for(const [root,name] of [[neighbor,'neighbor.txt'],[selected,'selected.txt']]){fs.mkdirSync(root);execFileSync('git',['init','-q'],{cwd:root});fs.writeFileSync(path.join(root,name),'fixture');}
  const context=collectGitContext(selected,{includeHistory:false});assert.equal(context.root,fs.realpathSync(selected));assert.deepEqual(context.changedPaths,['selected.txt']);assert.equal(fs.readFileSync(path.join(neighbor,'neighbor.txt'),'utf8'),'fixture');
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});

test('workspace fingerprints never silently omit a 201st dirty path',()=>{
 const dir=repo();
 try{
  for(let n=0;n<200;n++)fs.writeFileSync(path.join(dir,`dirty-${String(n).padStart(3,'0')}.txt`),'before');
  const complete=collectGitContext(dir,{includeHistory:false});assert.equal(complete.changedPaths.length,200);assert.match(complete.stateFingerprint,/^[0-9a-f]{64}$/);
  const excluded=path.join(dir,'dirty-200.txt');fs.writeFileSync(excluded,'first content');
  assert.throws(()=>collectGitContext(dir,{includeHistory:false}),error=>error.code==='EGITINVENTORY'&&/200/.test(error.message));
  fs.writeFileSync(excluded,'changed while already dirty');
  assert.throws(()=>collectGitContext(dir,{includeHistory:false}),error=>error.code==='EGITINVENTORY');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
