'use strict';
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const ALLOWED=new Set(['run','resume','apply','rollback','command']);
function runIsolatedDebug(action,options){
 if(!ALLOWED.has(action))return Promise.reject(Object.assign(new Error('Unknown Debug worker action.'),{code:'EDEBUGACTION'}));
 return new Promise((resolve,reject)=>{
   let worker;
   try{worker=new Worker(path.join(__dirname,'debug-worker.js'),{workerData:{action,options}});}
   catch(error){reject(error);return;}
   let settled=false;
   const finish=(error,result)=>{
     if(settled)return;settled=true;
     if(error)reject(error);else resolve(result);
   };
   worker.once('message',message=>{
     if(message?.ok===true)finish(null,message.result);
     else finish(Object.assign(new Error(message?.error?.message||'Debug worker failed.'),{code:message?.error?.code||'EDEBUGWORKER'}));
   });
   worker.once('error',error=>finish(error));
   worker.once('exit',code=>{if(!settled)finish(Object.assign(new Error(`Debug worker exited without a result (code ${code}).`),{code:'EDEBUGWORKEREXIT'}));});
 });
}
module.exports={runIsolatedDebug};
