'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {runIsolatedDebug}=require('../src/worker-runner');
test('explicit repro commands execute off the calling event loop',async()=>{
 const command=`${JSON.stringify(process.execPath)} -e "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200)"`;
 const task=runIsolatedDebug('command',{command,runOptions:{timeoutMs:5000,maxBuffer:65536}});
 let tick=false;setTimeout(()=>tick=true,20);
 await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(tick,true,'the Extension Host event loop should continue while a command executes');
 const result=await task;
 assert.equal(result.exitCode,0);
 assert.equal(result.timedOut,false);
});
test('only authorized Debug worker actions may run',async()=>{
 await assert.rejects(()=>runIsolatedDebug('unknown',{command:'echo no'}),error=>error.code==='EDEBUGACTION');
});

test('worker cancellation reaches the owned command process tree',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const {createCancellation}=require('../src/session-budget');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debug-cancel-')),beat=path.join(dir,'heartbeat'),script=path.join(dir,'parent.js');
 try{
  fs.writeFileSync(script,`const {spawn}=require('node:child_process');const child="const fs=require('node:fs');setInterval(()=>fs.writeFileSync(process.argv[1],String(Date.now())),20);";spawn(process.execPath,['-e',child,process.argv[2]],{stdio:'ignore'});setInterval(()=>{},1000);`);
  const cancellation=createCancellation(),task=runIsolatedDebug('command',{command:`${JSON.stringify(process.execPath)} ${JSON.stringify(script)} ${JSON.stringify(beat)}`,runOptions:{cwd:dir,timeoutMs:5000}},{cancellationToken:cancellation.token});
  const rejected=assert.rejects(task,error=>error.code==='ECANCELLED');
  for(let n=0;n<100&&!fs.existsSync(beat);n++)await new Promise(r=>setTimeout(r,20));
  assert.ok(fs.existsSync(beat),'descendant must be running before cancellation');cancellation.cancel();await rejected;
  await new Promise(r=>setTimeout(r,100));const stopped=fs.readFileSync(beat,'utf8');await new Promise(r=>setTimeout(r,100));
  assert.equal(fs.readFileSync(beat,'utf8'),stopped,'owned descendant must stop writing after cancellation');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});


test('explicit command preserves quoted executable and script paths with spaces',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'debug quoted command ')),script=path.join(root,'fixture with spaces.js');
 try{
  fs.writeFileSync(script,"process.stdout.write(JSON.stringify(process.argv.slice(2)));process.exitCode=7;\n");
  const command=`${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "argument with spaces"`;
  const result=await runIsolatedDebug('command',{command,runOptions:{cwd:root,timeoutMs:5000,maxBuffer:65536}});
  assert.equal(result.exitCode,7);assert.deepEqual(JSON.parse(result.stdout),['argument with spaces']);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('standalone worker commands honor the shorter total session deadline',async()=>{
 const command=`${JSON.stringify(process.execPath)} -e "setInterval(()=>{},1000)"`;
 const result=await runIsolatedDebug('command',{command,sessionTimeoutMs:50,runOptions:{timeoutMs:5000,maxBuffer:65536}});
 assert.equal(result.timedOut,true);assert.notEqual(result.exitCode,0);
});
