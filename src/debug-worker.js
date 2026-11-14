'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {runDebugSession,resumeDebugSession,applyDebugSessionPatch,rollbackDebugSession}=require('./debug');
const {runExplicitCommandAsync}=require('./runner');
const {createCancellation,sessionOptions}=require('./session-budget');
const controller=createCancellation(new Int32Array(workerData.cancelBuffer));
parentPort.on('message',message=>{if(message?.type==='cancel')controller.cancel();});
const ACTIONS={run:runDebugSession,resume:resumeDebugSession,apply:applyDebugSessionPatch,rollback:rollbackDebugSession};
(async()=>{
 const {action}=workerData||{},options={...workerData.options,cancellationToken:controller.token};
 const result=action==='command'?await runExplicitCommandAsync(options.command,{...options.runOptions,timeoutMs:sessionOptions(options).sessionBudget.remainingTimeout(options.runOptions?.timeoutMs??300000),cancellationToken:controller.token}):await ACTIONS[action](options);
 parentPort.postMessage({ok:true,result});parentPort.close();
})().catch(error=>{parentPort.postMessage({ok:false,error:{message:String(error?.message||error),code:String(error?.code||'EDEBUGWORKER'),executionBudget:error.executionBudget||null}});parentPort.close();});
