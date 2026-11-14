'use strict';
const {freeze}=require('./contracts');

function normalizedUsage(usage={}){
  if(!usage||typeof usage!=='object'||Array.isArray(usage))return null;
  // Codex JSONL uses snake_case; stored records use camelCase. Do not coerce
  // missing, null, string or conflicting counts into measured zero usage.
  const count=names=>{
    const values=names.filter(name=>Object.hasOwn(usage,name)).map(name=>usage[name]);
    if(!values.length)return undefined;
    return values.every(value=>Number.isSafeInteger(value)&&value>=0&&value===values[0])?values[0]:null;
  };
  const input=count(['inputTokens','input_tokens','input']),output=count(['outputTokens','output_tokens','output']);
  if(input==null||output==null||!Number.isSafeInteger(input+output))return null;
  const total=count(['totalTokens','total_tokens']),cachedInput=count(['cachedInputTokens','cached_input_tokens','cached_input']);
  if(total===null||(total!==undefined&&total!==input+output)||cachedInput===null||(cachedInput!==undefined&&cachedInput>input))return null;
  return Object.freeze({inputTokens:input,outputTokens:output,totalTokens:input+output,...(cachedInput===undefined?{}:{cachedInputTokens:cachedInput})});
}

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
    const observed=normalizedUsage(usage);
    if(observed){spent+=observed.totalTokens-entry.chargedTokens;entry.chargedTokens=observed.totalTokens;entry.usageStatus='observed';entry.usage={inputTokens:observed.inputTokens,outputTokens:observed.outputTokens};}
    entry.status=status;if(errorCode)entry.errorCode=String(errorCode);update();return snapshot();
  }
  return {snapshot,begin,finish,remainingTimeout,setPersistence(fn){persist=fn;update();}};
}
function sessionOptions(options={}){return {...options,sessionBudget:options.sessionBudget||createSessionBudget({maxEstimatedTokens:Number(options.maxEstimatedTokens??80000),sessionTimeoutMs:Number(options.sessionTimeoutMs??600000)})};}
module.exports={normalizedUsage,operationTimeout,createCancellation,createSessionBudget,sessionOptions,assertActive,cancelled};
