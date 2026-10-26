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
