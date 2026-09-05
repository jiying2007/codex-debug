'use strict';

const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {freeze}=require('./contracts');
function runExplicitCommand(command,{cwd=process.cwd(),timeoutMs=300000,maxBuffer=8*1024*1024,env=process.env}={}){const text=String(command||'').trim();if(!text)throw Object.assign(new Error('Explicit command is required.'),{code:'ECOMMAND'});const start=performance.now();const result=spawnSync(text,{cwd,env,shell:true,encoding:'utf8',timeout:timeoutMs,maxBuffer,windowsHide:true});const durationMs=Math.round(performance.now()-start);if(result.error&&result.error.code==='ETIMEDOUT')return freeze({command:text,exitCode:null,signal:result.signal||'',timedOut:true,durationMs,stdout:String(result.stdout||''),stderr:String(result.stderr||'')});if(result.error&&!['ENOBUFS'].includes(result.error.code))throw Object.assign(new Error(`Command execution failed: ${result.error.message}`),{code:'ECOMMANDEXEC'});return freeze({command:text,exitCode:Number.isInteger(result.status)?result.status:null,signal:result.signal||'',timedOut:false,durationMs,stdout:String(result.stdout||''),stderr:String(result.stderr||''),truncated:Boolean(result.error&&result.error.code==='ENOBUFS')});}
function combinedOutput(result){return [`$ ${result.command}`,`exit=${result.exitCode===null?'null':result.exitCode} signal=${result.signal||'-'} timeout=${result.timedOut?'yes':'no'}`,result.stdout||'',result.stderr||''].join('\n');}
module.exports={runExplicitCommand,combinedOutput};
