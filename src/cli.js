#!/usr/bin/env node
'use strict';
const {parseArgs,help}=require('./args');
const {createCancellation,sessionOptions,cancelled}=require('./session-budget');
const {runDebugSession,resumeDebugSession,applyDebugSessionPatch,rollbackDebugSession}=require('./debug');
async function readStdin({stream=process.stdin,maxBytes=8*1024*1024,cancellationToken,timeoutMs=600000}={}){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Object.assign(new Error('Failure input limit must be a positive integer.'),{code:'EEVIDENCELIMIT'});
  if(cancellationToken?.isCancellationRequested)throw cancelled();
  if(stream.isTTY)return '';
  const chunks=[];let total=0,timer,subscription;
  const abort=error=>stream.destroy(error);
  try{
    subscription=cancellationToken?.onCancellationRequested(()=>abort(cancelled()));
    timer=setTimeout(()=>abort(Object.assign(new Error('Debug session deadline exceeded while reading stdin.'),{code:'EDEBUGDEADLINE'})),timeoutMs);
    for await(const chunk of stream){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);total+=bytes.length;if(total>maxBytes)throw Object.assign(new Error(`Failure input exceeds ${maxBytes} bytes.`),{code:'EEVIDENCELIMIT'});chunks.push(bytes);}
    return Buffer.concat(chunks,total).toString('utf8');
  }finally{clearTimeout(timer);subscription?.dispose();}
}
async function main(){
  let options=parseArgs(process.argv.slice(2));
  if(options.help){process.stdout.write(help());return;}
  options=sessionOptions(options);const cancellation=createCancellation();options.cancellationToken=cancellation.token;const cancel=()=>cancellation.cancel();process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
  try{
  let result,action='debug';
  if(options.applySession){action='apply-session';result=await applyDebugSessionPatch({...options,sessionId:options.applySession});}
  else if(options.rollbackSession){action='rollback-session';result=rollbackDebugSession({...options,sessionId:options.rollbackSession});}
  else if(options.resume){action='resume';result=await resumeDebugSession(options);}
  else{
    if(!options.logFile&&!options.command&&!options.coreFile)options.text=await readStdin({maxBytes:Number(options.maxLogBytes||8*1024*1024),cancellationToken:cancellation.token,timeoutMs:options.sessionBudget.remainingTimeout(1800000)});
    if(!options.logFile&&!options.command&&!options.coreFile&&!String(options.text||'').trim()&&!options.artifacts.length)throw new Error('Provide --log, --command, --core/--executable, --artifact, or pipe failure evidence on stdin.');
    result=await runDebugSession(options);
  }
  if(result.verification?.interruption)process.exitCode=result.verification.interruption.code==='ECANCELLED'?130:2;
  process.stdout.write(`${JSON.stringify({
    action,
    sessionId:result.sessionId,
    parentSessionId:result.lineage?.parentSessionId||null,
    fixStatus:result.fixStatus,
    failureKind:result.evidence.kind,
    rootCause:result.investigation.rootCause,
    confidence:result.investigation.confidence,
    bisect:result.evidence.bisect||null,
    recommendedTests:result.evidence.regressionTests?.recommendedTests||[],
    patch:result.patch,
    verification:result.verification,
    rollback:result.lineage?.rollback||null,
    sessionPath:result.sessionPath||'',
    receipt:result.receipt
  },null,2)}\n`);
  }finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
if(require.main===module)main().catch(error=>{process.stderr.write(`Codex Debug Safe failed: ${error.message}${error.executionBudget?` (charged tokens: ${error.executionBudget.chargedTokens}; unknown calls: ${error.executionBudget.unknownUsageCalls})`:''}\n`);process.exitCode=2;});
module.exports={main,readStdin};
