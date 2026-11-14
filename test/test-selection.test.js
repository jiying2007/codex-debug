'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {isTestPath,readCandidate}=require('../src/test-selection');
test('recognizes common test paths without treating source as tests',()=>{assert.equal(isTestPath('test/audio.test.js'),true);assert.equal(isTestPath('tests/audio_test.cpp'),true);assert.equal(isTestPath('src/audio.cpp'),false);});
test('test-impact candidate reader refuses symlink escape outside workspace',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-test-select-root-')),outside=fs.mkdtempSync(path.join(os.tmpdir(),'codex-test-select-outside-'));try{fs.mkdirSync(path.join(root,'test'));fs.writeFileSync(path.join(outside,'secret.test.js'),'external-secret-test-content\n');let linked=false;try{fs.symlinkSync(path.join(outside,'secret.test.js'),path.join(root,'test','linked.test.js'),'file');linked=true;}catch(error){if(!['EPERM','EACCES','UNKNOWN'].includes(error.code))throw error;}if(linked)assert.equal(readCandidate(root,'test/linked.test.js'),'');}finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}});


test('test candidate reads cannot bypass the byte limit by growing after open',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'debug-test-growth-')),file=path.join(root,'grow.test.js');fs.writeFileSync(file,'x');const original=fs.readSync;let grown=false;
 try{fs.readSync=function(fd,...args){if(!grown){grown=true;fs.appendFileSync(file,'y'.repeat(100));}return original.call(this,fd,...args);};assert.equal(readCandidate(root,'grow.test.js',8),'');}
 finally{fs.readSync=original;fs.rmSync(root,{recursive:true,force:true});}
});
test('Git test enumeration preserves literal backslashes and newlines',{skip:process.platform==='win32'},()=>{
 const {execFileSync}=require('node:child_process'),{gitFiles}=require('../src/test-selection'),root=fs.mkdtempSync(path.join(os.tmpdir(),'debug-test-raw-'));
 try{fs.mkdirSync(path.join(root,'test'));const names=['test/a\\b.test.js','test/a\nb.test.js'];for(const name of names)fs.writeFileSync(path.join(root,name),'test fixture');execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['add','--all'],{cwd:root});assert.deepEqual(gitFiles(root).sort(),names.sort());assert.equal(readCandidate(root,names.find(name=>name.includes('\\'))),'test fixture');}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('test-impact recommendations keep raw Git paths through the Core boundary',{skip:process.platform==='win32'},()=>{
 const {execFileSync}=require('node:child_process'),{selectRegressionTests}=require('../src/test-selection'),root=fs.mkdtempSync(path.join(os.tmpdir(),'debug-impact-raw-'));
 try{fs.mkdirSync(path.join(root,'test','a'),{recursive:true});const names=['test/a\\b.test.js','test/a/b.test.js','test/trailing.test.js '];for(const name of names)fs.writeFileSync(path.join(root,name),'widget.js reference');execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['add','--all'],{cwd:root});const changedPaths=['src\\widget.js','src/widget.js'],result=selectRegressionTests(root,{changedPaths});assert.deepEqual(result.changedPaths,changedPaths);assert.deepEqual(result.recommendedTests.map(item=>item.path).sort(),names.sort());for(const item of result.recommendedTests)assert.equal(item.id,item.path);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
