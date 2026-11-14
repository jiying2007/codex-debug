'use strict';
const {freeze}=require('./contracts');

function createCancellation(sharedFlag){let requested=false;const listeners=new Set();const token={get isCancellationRequested(){return requested||Boolean(sharedFlag&&Atomics.load(sharedFlag,0));},onCancellationRequested(fn){listeners.add(fn);return {dispose(){listeners.delete(fn);}};}};return {token,cancel(){requested=true;if(sharedFlag)Atomics.store(sharedFlag,0,1);for(const fn of listeners)fn();}};}
function cancelled(){return Object.assign(new Error('Debug operation cancelled at a safe boundary.'),{code:'ECANCELLED'});}
function assertActive(options={}){
  if(options.cancellationToken?.isCancellationRequested)throw cancelled();
  if(options.sessionBudget)options.sessionBudget.remainingTimeout(1800000);
}
function operationTimeout(requested,options={}){assertActive(options);return options.sessionBudget?options.sessionBudget.remainingTimeout(requested):requested;}
function createSessionBudget({maxEstimatedTokens=80000,sessionTimeoutMs=600000,now=Date.now,onUpdate=()=>{}}={}){
  if(!Number.isSafeInteger(maxEstimatedTokens)||maxEstimatedTokens<1)throw Object.assign(new Error('Session token budget must be a positive integer.'),{code:'ETOKENBUDGET'});
  if(!Number.isSafeInteger(sessionTimeoutMs)||sessionTimeoutMs<1||sessionTimeoutMs>1800000)throw Object.assign(new Error('Session timeout must be in 1..1800000 milliseconds.'),{code:'EDEBUGDEADLINE'});
  const startedAt=now(),deadlineAt=startedAt+sessionTimeoutMs,entries=[];let spent=0,persist=onUpdate;
  const snapshot=()=>freeze({schemaVersion:1,maxEstimatedTokens,startedAt,deadlineAt,chargedTokens:spent,remainingTokens:Math.max(0,maxEstimatedTokens-spent),unknownUsageCalls:entries.filter(e=>e.usageStatus!=='observed').length,calls:entries});
  const update=()=>persist(snapshot());
  function remainingTimeout(requested){if(!Number.isFinite(requested)||requested<=0)throw Object.assign(new Error('Operation timeout must be a positive finite number.'),{code:'EDEBUGDEADLINE',executionBudget:snapshot()});const remaining=deadlineAt-now();if(remaining<=0)throw Object.assign(new Error('Debug session deadline exceeded.'),{code:'EDEBUGDEADLINE',executionBudget:snapshot()});return Math.max(1,Math.min(Math.floor(requested),remaining));}
  function begin(phase,estimate,{reserveTokens=0}={}){
    remainingTimeout(1800000);
    const tokens=Number(estimate?.totalTokens);
    if(!Number.isSafeInteger(tokens)||tokens<1||!Number.isSafeInteger(reserveTokens)||reserveTokens<0)throw new TypeError('Invalid phase token estimate.');
    if(tokens+reserveTokens>maxEstimatedTokens-spent)throw Object.assign(new Error(`Debug session token budget exceeded before ${phase}: request ${tokens}, reserved ${reserveTokens}, remaining ${Math.max(0,maxEstimatedTokens-spent)}.`),{code:'ETOKENBUDGET',executionBudget:snapshot()});
    const ticket=entries.length;entries.push({phase:String(phase),status:'running',requestEstimate:estimate,chargedTokens:tokens,usageStatus:'unknown',usage:null});spent+=tokens;update();return ticket;
  }
  function finish(ticket,usage,{status='completed',errorCode=''}={}){
    const entry=entries[ticket];if(!entry||entry.status!=='running')throw new Error('Phase budget ticket is stale.');
    const input=Number(usage?.inputTokens??usage?.input_tokens),output=Number(usage?.outputTokens??usage?.output_tokens),known=Number.isSafeInteger(input)&&input>=0&&Number.isSafeInteger(output)&&output>=0&&Number.isSafeInteger(input+output)&&input+output>0;
    if(known){spent+=input+output-entry.chargedTokens;entry.chargedTokens=input+output;entry.usageStatus='observed';entry.usage={inputTokens:input,outputTokens:output};}
    entry.status=status;if(errorCode)entry.errorCode=String(errorCode);update();return snapshot();
  }
  return {snapshot,begin,finish,remainingTimeout,setPersistence(fn){persist=fn;update();}};
}
function sessionOptions(options={}){return {...options,sessionBudget:options.sessionBudget||createSessionBudget({maxEstimatedTokens:Number(options.maxEstimatedTokens??80000),sessionTimeoutMs:Number(options.sessionTimeoutMs??600000)})};}
module.exports={operationTimeout,createCancellation,createSessionBudget,sessionOptions,assertActive,cancelled};
