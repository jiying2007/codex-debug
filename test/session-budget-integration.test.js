'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {createRequire}=require('node:module');
const {createSessionBudget}=require('../src/session-budget');const {estimateRequestTokens}=require('../src/codex-safe-core/efficiency-planner');

function fixtureCodex(run){
 const file=path.resolve(__dirname,'../src/codex.js'),localRequire=createRequire(file),mod={exports:{}};
 const stubs={
  './codex-safe-core/codex-cli':{createCodexCli(){return {runStructuredCodex:run};}},
  './codex-safe-core/codex-runtime-resolver':{resolveCodexRuntime(){return {source:'test-fixture',runtime:{provider:{mode:'codex-cli'}}};}},
  './codex-safe-core/model-registry-resolver':{resolveModelRegistry(){return {registry:null};}}
 };
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,exports:mod.exports,Buffer,process,require:name=>stubs[name]||localRequire(name)},{filename:file});return mod.exports;
}
const evidence={kind:'test',parsed:{frames:[],signals:['fatal fixture']},compact:{text:'fatal fixture'},sourceContext:[],artifacts:[],regressionTests:{recommendedTests:[]}};
const draft={rootCause:'Controlled fixture',confidence:0.5,hypotheses:[{id:'H1',title:'Fixture',claim:'Fixture',status:'open',evidenceFor:[],evidenceAgainst:[],causalAnchors:[],verificationSteps:[]}],patch:null,verificationPlan:[],coverageGaps:[]};

test('real investigation admission reserves its verifier before the fake provider can run',async()=>{
 let calls=0;const codex=fixtureCodex(async()=>{calls++;return {parsed:draft};});
 const first=estimateRequestTokens(codex.buildDebugPrompt({evidence}),{estimatedOutputTokens:5000}).totalTokens,reserve=estimateRequestTokens(codex.buildCausalVerificationPrompt({evidence,investigation:{}}),{estimatedOutputTokens:3500}).totalTokens+5000;
 const budget=createSessionBudget({maxEstimatedTokens:first+reserve-1});
 await assert.rejects(()=>codex.runCodexInvestigation({evidence,options:{sessionBudget:budget}}),error=>error.code==='ETOKENBUDGET');assert.equal(calls,0);assert.equal(budget.snapshot().calls.length,0);
});

test('observed first-phase usage blocks the real verifier entry point on the same session budget',async()=>{
 const limit=50000,calls=[];const codex=fixtureCodex(async request=>{calls.push(request.phase);return {parsed:draft,usage:{inputTokens:limit,outputTokens:0}};}),budget=createSessionBudget({maxEstimatedTokens:limit}),options={sessionBudget:budget};
 const first=await codex.runCodexInvestigation({evidence,options});
 await assert.rejects(()=>codex.runCodexCausalVerification({evidence,investigation:first.investigation,options}),error=>error.code==='ETOKENBUDGET');
 assert.deepEqual(calls,['debug-investigation']);assert.equal(budget.snapshot().chargedTokens,limit);assert.equal(budget.snapshot().calls[0].usageStatus,'observed');
});

test('provider failure at the real phase boundary retains an unknown usage charge',async()=>{
 const codex=fixtureCodex(async()=>{throw Object.assign(new Error('Controlled provider failure'),{code:'EFIXTURE'});}),budget=createSessionBudget({maxEstimatedTokens:50000});
 await assert.rejects(()=>codex.runCodexInvestigation({evidence,options:{sessionBudget:budget}}),error=>error.code==='EFIXTURE'&&error.executionBudget.unknownUsageCalls===1);
 const state=budget.snapshot();assert.equal(state.calls[0].status,'failed');assert.equal(state.calls[0].usage,null);assert.ok(state.chargedTokens>0);
});

function fixtureTransport(run){
 const file=path.resolve(__dirname,'../src/codex.js'),localRequire=createRequire(file),mod={exports:{}};
 const {REQUIRED_CODEX_TOP_LEVEL_FLAGS,REQUIRED_CODEX_EXEC_FLAGS}=localRequire('./codex-safe-core/safe-contract');
 const stubs={
  './codex-safe-core/process-runner':{createProcessRunner(){return {async runPreparedProcess(_command,args,options){
   if(_command==='where.exe')return {stdout:'codex.exe\n',stderr:''};
   if(args[0]==='--version')return {stdout:'codex-cli 9.9.9\n',stderr:''};
   if(args.includes('--help'))return {stdout:(args[0]==='exec'?[...REQUIRED_CODEX_EXEC_FLAGS,'--model']:REQUIRED_CODEX_TOP_LEVEL_FLAGS).join(' '),stderr:''};
   return run(options);
  }};}},
  './codex-safe-core/codex-runtime-resolver':{resolveCodexRuntime(){return {source:'fixture',runtime:{provider:{mode:'openai'}}};}},
  './codex-safe-core/model-registry-resolver':{resolveModelRegistry(){return {registry:null};}}
 };
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,exports:mod.exports,Buffer,process,require:name=>stubs[name]||localRequire(name)},{filename:file});return mod.exports;
}

for(const mode of ['cancelled','invalid-agent','invalid-jsonl'])test(`actual Core CLI retains observed usage after ${mode} transport`,async()=>{
 const usage={input_tokens:100,output_tokens:20};
 const codex=fixtureTransport(async options=>{
  const agent={type:'item.completed',item:{type:'agent_message',text:mode==='invalid-agent'?'not-json':JSON.stringify(draft)}};
  const line=JSON.stringify(agent)+'\n'+JSON.stringify({type:'turn.completed',usage})+(mode==='invalid-agent'?'':'\n');
  options.onStdoutChunk(Buffer.from(line+(mode==='invalid-jsonl'?'invalid-jsonl\n':'')));
  if(mode==='cancelled')throw Object.assign(new Error('Controlled cancellation'),{code:'ECANCELLED'});
  return {stdout:line,stderr:''};
 }),budget=createSessionBudget({maxEstimatedTokens:50000});
 await assert.rejects(()=>codex.runCodexInvestigation({evidence,options:{sessionBudget:budget}}));
 const state=budget.snapshot();assert.equal(state.calls[0].status,'failed');assert.equal(state.unknownUsageCalls,0);assert.equal(state.chargedTokens,120);assert.deepEqual(state.calls[0].usage,{inputTokens:100,outputTokens:20});
});

test('actual Core CLI cancellation without usage remains unknown and charged',async()=>{
 const codex=fixtureTransport(async()=>{throw Object.assign(new Error('Controlled cancellation'),{code:'ECANCELLED'});}),budget=createSessionBudget({maxEstimatedTokens:50000});
 await assert.rejects(()=>codex.runCodexInvestigation({evidence,options:{sessionBudget:budget}}));
 const state=budget.snapshot();assert.equal(state.calls[0].status,'failed');assert.equal(state.unknownUsageCalls,1);assert.equal(state.calls[0].usage,null);assert.ok(state.chargedTokens>0);
});
