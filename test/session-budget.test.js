'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createSessionBudget,createCancellation}=require('../src/session-budget');
const {writeExecutionLedger}=require('../src/session-store');
const {runDebugSession}=require('../src/debug');
const {runReproductionSeriesAsync,sameCommand}=require('../src/reproduction');

test('two model phases share one budget and preserve verifier headroom',()=>{
 const budget=createSessionBudget({maxEstimatedTokens:1000});
 assert.throws(()=>budget.begin('hypothesis',{totalTokens:600},{reserveTokens:500}),error=>error.code==='ETOKENBUDGET');
 assert.equal(budget.snapshot().calls.length,0);
 const first=budget.begin('hypothesis',{totalTokens:600},{reserveTokens:400});
 budget.finish(first,{inputTokens:500,outputTokens:100});
 assert.throws(()=>budget.begin('verifier',{totalTokens:401}),error=>error.code==='ETOKENBUDGET');
 const second=budget.begin('verifier',{totalTokens:400});budget.finish(second,{inputTokens:300,outputTokens:100});
 assert.equal(budget.snapshot().chargedTokens,1000);assert.equal(budget.snapshot().remainingTokens,0);
});
test('failed and missing usage remain persisted unknown rather than zero',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debug-ledger-')),id='dbg-'+'b'.repeat(16);
 try{
  const budget=createSessionBudget({maxEstimatedTokens:1000,onUpdate:record=>writeExecutionLedger(dir,id,record)});
  const first=budget.begin('hypothesis',{totalTokens:600});budget.finish(first,undefined,{status:'failed',errorCode:'ECANCELLED'});
  const record=JSON.parse(fs.readFileSync(path.join(dir,'.codex-debug','executions',`${id}.json`),'utf8'));
  assert.equal(record.chargedTokens,600);assert.equal(record.unknownUsageCalls,1);assert.equal(record.calls[0].usage,null);assert.equal(record.calls[0].status,'failed');
  assert.throws(()=>budget.begin('retry',{totalTokens:401}),error=>error.code==='ETOKENBUDGET');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('one deadline is shared and cannot reset between phases',()=>{
 let clock=100;const budget=createSessionBudget({sessionTimeoutMs:100,now:()=>clock});
 assert.equal(budget.remainingTimeout(1000),100);clock=180;assert.equal(budget.remainingTimeout(1000),20);clock=200;
 assert.throws(()=>budget.remainingTimeout(1000),error=>error.code==='EDEBUGDEADLINE');
});
test('invalid per-command timeouts cannot disable the shared deadline',()=>{
 const budget=createSessionBudget();for(const value of [NaN,Infinity,0,-1])assert.throws(()=>budget.remainingTimeout(value),error=>error.code==='EDEBUGDEADLINE');
});
test('observed usage overrun stops the next call instead of silently extending the session',()=>{
 const budget=createSessionBudget({maxEstimatedTokens:100});const ticket=budget.begin('hypothesis',{totalTokens:90});budget.finish(ticket,{inputTokens:100,outputTokens:20});
 assert.equal(budget.snapshot().chargedTokens,120);assert.equal(budget.snapshot().remainingTokens,0);
 assert.throws(()=>budget.begin('verifier',{totalTokens:1}),error=>error.code==='ETOKENBUDGET');
});
test('reproduction identities bind the directory and effective environment',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debug-env-'));
 try{
  const command=`${JSON.stringify(process.execPath)} -e "process.exit(process.env.DEBUG_FIXTURE_STATE==='bad'?1:0)"`;
  const before=await runReproductionSeriesAsync(command,{cwd:dir,env:{...process.env,DEBUG_FIXTURE_STATE:'bad'}});
  const after=await runReproductionSeriesAsync(command,{cwd:dir,env:{...process.env,DEBUG_FIXTURE_STATE:'good'}});
  assert.equal(before.summary.commandDigest,after.summary.commandDigest);assert.notEqual(before.summary.executionContextDigest,after.summary.executionContextDigest);assert.equal(sameCommand(before.summary,after.summary),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('cancelled sessions do not start a reproduction',async()=>{
 const cancellation=createCancellation();cancellation.cancel();
 await assert.rejects(()=>runDebugSession({workspace:os.tmpdir(),command:'must-not-execute',deterministicOnly:true,persist:false,cancellationToken:cancellation.token}),error=>error.code==='ECANCELLED');
});
