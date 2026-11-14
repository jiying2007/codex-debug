'use strict';

const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {freeze,stableDigest}=require('./contracts');
const path=require('node:path');
function executionContextDigest(cwd,env){return stableDigest({cwd:path.resolve(cwd),environment:Object.fromEntries(Object.keys(env).sort().map(key=>[key,String(env[key])]))});}
function runExplicitCommand(command,{cwd=process.cwd(),timeoutMs=300000,maxBuffer=8*1024*1024,env=process.env}={}){const text=String(command||'').trim();if(!text)throw Object.assign(new Error('Explicit command is required.'),{code:'ECOMMAND'});const start=performance.now();const result=spawnSync(text,{cwd,env,shell:true,encoding:'utf8',timeout:timeoutMs,maxBuffer,windowsHide:true});const durationMs=Math.round(performance.now()-start);if(result.error&&result.error.code==='ETIMEDOUT')return freeze({command:text,exitCode:null,signal:result.signal||'',timedOut:true,durationMs,stdout:String(result.stdout||''),stderr:String(result.stderr||'')});if(result.error&&!['ENOBUFS'].includes(result.error.code))throw Object.assign(new Error(`Command execution failed: ${result.error.message}`),{code:'ECOMMANDEXEC'});return freeze({command:text,exitCode:Number.isInteger(result.status)?result.status:null,signal:result.signal||'',timedOut:false,durationMs,stdout:String(result.stdout||''),stderr:String(result.stderr||''),truncated:Boolean(result.error&&result.error.code==='ENOBUFS')});}
async function runExplicitCommandAsync(command,{cwd=process.cwd(),timeoutMs=300000,maxBuffer=8*1024*1024,env=process.env,cancellationToken}={}){
  const text=String(command||'').trim();if(!text)throw Object.assign(new Error('Explicit command is required.'),{code:'ECOMMAND'});
  if(cancellationToken?.isCancellationRequested)throw Object.assign(new Error('Debug command cancelled.'),{code:'ECANCELLED'});
  const {createProcessRunner}=require('./codex-safe-core/process-runner');
  const started=performance.now(),runner=createProcessRunner((_zh,en)=>en),shell=process.platform==='win32'?(env.ComSpec||env.COMSPEC||env.comspec||'cmd.exe'):'/bin/sh';
  // Match Node's explicit shell-command contract. Core's prepared-argv helper
  // resets verbatim flags and must not re-escape an already authorized cmd line.
  const windowsCmd=process.platform==='win32'&&/^(?:.*\\)?cmd(?:\.exe)?$/i.test(shell),args=windowsCmd?['/d','/s','/c',`"${text}"`]:['-c',text];
  const base={command:text,executionContextDigest:executionContextDigest(cwd,env),signal:'',timedOut:false};
  try{const result=await runner.runProcess(shell,args,{cwd,env,timeoutMs,windowsVerbatimArguments:windowsCmd,maxStdoutBytes:maxBuffer,maxStderrBytes:maxBuffer},'',cancellationToken);return freeze({...base,exitCode:0,durationMs:Math.round(performance.now()-started),stdout:result.stdout,stderr:result.stderr});}
  catch(error){
    if(error.code==='ECANCELLED')throw error;
    if(typeof error.code!=='number'&&!['ETIMEDOUT','EOUTPUTLIMIT'].includes(error.code))throw Object.assign(new Error(`Command execution failed: ${error.message}`),{code:'ECOMMANDEXEC',cause:error});
    return freeze({...base,exitCode:typeof error.code==='number'?error.code:null,timedOut:error.code==='ETIMEDOUT',truncated:error.code==='EOUTPUTLIMIT',durationMs:Math.round(performance.now()-started),stdout:String(error.stdout??error.stdoutTail??''),stderr:String(error.stderr??error.stderrTail??'')});
  }
}
function combinedOutput(result){return [`$ ${result.command}`,`exit=${result.exitCode===null?'null':result.exitCode} signal=${result.signal||'-'} timeout=${result.timedOut?'yes':'no'}`,result.stdout||'',result.stderr||''].join('\n');}
module.exports={runExplicitCommand,runExplicitCommandAsync,executionContextDigest,combinedOutput};
