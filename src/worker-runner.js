'use strict';
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const ALLOWED=new Set(['run','resume','apply','rollback','command']);
function runIsolatedDebug(action,options,{cancellationToken}={}){
 if(!ALLOWED.has(action))return Promise.reject(Object.assign(new Error('Unknown Debug worker action.'),{code:'EDEBUGACTION'}));
 if(cancellationToken?.isCancellationRequested)return Promise.reject(Object.assign(new Error('Debug operation cancelled.'),{code:'ECANCELLED'}));
 return new Promise((resolve,reject)=>{
   let worker,cancellationDisposable;const cancelBuffer=new SharedArrayBuffer(4),cancelFlag=new Int32Array(cancelBuffer);
   try{worker=new Worker(path.join(__dirname,'debug-worker.js'),{workerData:{action,options,cancelBuffer}});}
   catch(error){reject(error);return;}
   let settled=false;
   const finish=(error,result)=>{
     if(settled)return;settled=true;cancellationDisposable?.dispose();
     if(error)reject(error);else resolve(result);
   };
   if(cancellationToken){const cancel=()=>{Atomics.store(cancelFlag,0,1);worker.postMessage({type:'cancel'});};cancellationDisposable=cancellationToken.onCancellationRequested(cancel);if(cancellationToken.isCancellationRequested)cancel();}
   worker.once('message',message=>{
     if(message?.ok===true)finish(null,message.result);
     else finish(Object.assign(new Error(message?.error?.message||'Debug worker failed.'),{code:message?.error?.code||'EDEBUGWORKER',executionBudget:message?.error?.executionBudget||null}));
   });
   worker.once('error',error=>finish(error));
   worker.once('exit',code=>{if(!settled)finish(Object.assign(new Error(`Debug worker exited without a result (code ${code}).`),{code:'EDEBUGWORKEREXIT'}));});
 });
}
module.exports={runIsolatedDebug};
