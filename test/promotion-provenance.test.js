'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {verifyRepositoryState}=require('../scripts/promotion-provenance');

function git(args,cwd){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function commitFile(root,file,text,message){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text,'utf8');git(['add',file],root);git(['commit','-qm',message],root);return git(['rev-parse','HEAD'],root);}

test('promotion provenance proves direct-parent fix and ground-truth file membership without executing the reproduction',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-provenance-local-'));
  try{
    git(['init','-q'],root);git(['config','user.name','provenance-test'],root);git(['config','user.email','provenance@example.invalid'],root);
    const bad=commitFile(root,'src/value.js',"module.exports='bad';\n",'bad');
    const fixed=commitFile(root,'src/value.js',"module.exports='fixed';\n",'fix');
    const item={id:'local-provenance-case',repository:'https://github.com/example/example.git',anchorRef:'refs/heads/main',badCommit:bad,fixedCommit:fixed,groundTruth:{files:['src/value.js']}};
    const result=verifyRepositoryState(root,item,{anchorCommit:fixed,env:process.env});
    assert.equal(result.badCommit,bad);
    assert.equal(result.fixedCommit,fixed);
    assert.equal(result.parentCommit,bad);
    assert.equal(result.anchorCommit,fixed);
    assert.deepEqual(result.groundTruthFiles,['src/value.js']);
    assert.match(result.changedFilesDigest,/^[0-9a-f]{64}$/);
    assert.match(result.provenanceDigest,/^[0-9a-f]{64}$/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('promotion provenance refuses a ground-truth file absent from the reviewed fix',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-provenance-negative-'));
  try{
    git(['init','-q'],root);git(['config','user.name','provenance-test'],root);git(['config','user.email','provenance@example.invalid'],root);
    const bad=commitFile(root,'src/value.js',"module.exports='bad';\n",'bad');
    const fixed=commitFile(root,'src/value.js',"module.exports='fixed';\n",'fix');
    const item={id:'local-provenance-negative',repository:'https://github.com/example/example.git',anchorRef:'refs/heads/main',badCommit:bad,fixedCommit:fixed,groundTruth:{files:['src/not-changed.js']}};
    assert.throws(()=>verifyRepositoryState(root,item,{anchorCommit:fixed,env:process.env}),/ground-truth file .* is absent from fixed commit/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
