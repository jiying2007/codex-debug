'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {runDebugSession,resumeDebugSession,applyDebugSessionPatch,rollbackDebugSession}=require('./debug');
const {runExplicitCommand}=require('./runner');
const ACTIONS={run:runDebugSession,resume:resumeDebugSession,apply:applyDebugSessionPatch,rollback:rollbackDebugSession};
(async()=>{
 const {action,options}=workerData||{};
 const result=action==='command'?runExplicitCommand(options.command,options.runOptions):await ACTIONS[action](options);
 parentPort.postMessage({ok:true,result});
})().catch(error=>parentPort.postMessage({ok:false,error:{message:String(error?.message||error),code:String(error?.code||'EDEBUGWORKER')}}));
