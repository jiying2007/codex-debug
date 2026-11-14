'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {stableDigest}=require('../scripts/model-evaluation');
const root=path.resolve(__dirname,'..');

// Execute the actual CLIs with deterministic model and historical adapters.
// No model runtime, historical checkout or network request is invoked.
function runFixture(script,{validUsage=false,collide=false}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debug-eval-persistence-'));
  const preload=path.join(dir,'preload.cjs'),record=path.join(dir,'record.json'),summary=collide?record:path.join(dir,'summary.json'),transitions=path.join(dir,'transitions.json');
  fs.writeFileSync(preload,`
    'use strict';
    const Module=require('node:module'),path=require('node:path');
    const original=Module._load,root=${JSON.stringify(root)};
    const phase={model:'deterministic-test',codexVersion:'0.0.0-test',runtimeSource:'test-fixture',usage:${validUsage?'JSON.parse(\'{"input_tokens":0,"output_tokens":0,"cached_input_tokens":0}\')':'undefined'}};
    global.fetch=()=>{throw new Error('NETWORK_FORBIDDEN_IN_FIXTURE');};
    Module._load=function(request,parent,isMain){
      const resolved=Module._resolveFilename(request,parent,isMain);
      if(resolved===path.join(root,'src','debug.js'))return {runDebugSession:async()=>({
        evidence:{digest:'e'.repeat(64)},
        investigation:{rootCause:'Deterministic test fixture',hypotheses:[],causalVerification:{rootCauseAssessment:'insufficient',patchDisposition:'none'}},
        execution:{hypothesis:{...phase},causalVerification:{...phase}}
      })};
      if(resolved===path.join(root,'src','codex.js'))return {inspectRuntimeFromOptions:()=>({providerId:'test',source:'test-fixture'})};
      if(resolved===path.join(root,'src','reproduction.js'))return {runReproductionSeries:()=>({representative:{stdout:'fixture failure',stderr:''},summary:{runs:1,failures:1,timeouts:0,reproducibleFailure:true}})};
      if(resolved===path.join(root,'scripts','historical-case.js'))return {materializeHistoricalCase:item=>({repo:root,env:{},transition:{caseId:item.id,testFixture:true},cleanup(){}})};
      return original.apply(this,arguments);
    };
  `);
  fs.writeFileSync(summary,JSON.stringify({staleSuccess:true}));
  const args=['--require',preload,path.join(root,'scripts',script),'--output',record,'--summary',summary];
  if(script==='promotion-live-eval.js')args.push('--transitions',transitions);
  const processResult=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  return {dir,record,summary,transitions,processResult,cleanup(){fs.rmSync(dir,{recursive:true,force:true});}};
}

for(const script of ['live-model-eval.js','promotion-live-eval.js']){
  test(`${script} retains unknown-usage record and fails without a successful summary`,()=>{
    const run=runFixture(script);
    try{
      assert.equal(run.processResult.error,undefined);assert.equal(run.processResult.status,2,run.processResult.stderr);
      assert.match(run.processResult.stderr,/complete valid usage is required/);
      assert.equal(fs.existsSync(run.summary),false,'stale success summary must be removed');
      const record=JSON.parse(fs.readFileSync(run.record,'utf8'));
      assert.equal(record.cases.length,script==='promotion-live-eval.js'?25:3);
      assert.ok(record.cases.every(item=>item.execution.hypothesis.usage===null&&item.execution.causalVerification.usage===null));
      const unsigned={...record};delete unsigned.recordDigest;assert.equal(record.recordDigest,stableDigest(unsigned));
      if(script==='promotion-live-eval.js'){
        const transitions=JSON.parse(fs.readFileSync(run.transitions,'utf8'));
        assert.equal(transitions.cases.length,22);assert.equal(transitions.debugCommit,record.debugCommit);
        const unsignedTransitions={...transitions};delete unsignedTransitions.digest;assert.equal(transitions.digest,stableDigest(unsignedTransitions));
      }
    }finally{run.cleanup();}
  });

  test(`${script} still saves a valid explicit-zero summary`,()=>{
    const run=runFixture(script,{validUsage:true});
    try{
      assert.equal(run.processResult.error,undefined);assert.equal(run.processResult.status,0,run.processResult.stderr);
      const summary=JSON.parse(fs.readFileSync(run.summary,'utf8'));
      assert.equal(summary.usage.totalTokens,0);assert.equal(summary.staleSuccess,undefined);
    }finally{run.cleanup();}
  });

  test(`${script} rejects colliding output paths before replacing existing data`,()=>{
    const run=runFixture(script,{collide:true});
    try{
      assert.equal(run.processResult.status,2);assert.match(run.processResult.stderr,/distinct paths/);
      assert.deepEqual(JSON.parse(fs.readFileSync(run.record,'utf8')),{staleSuccess:true});
    }finally{run.cleanup();}
  });
}

test('both model workflows retain available evidence when validation fails',()=>{
  for(const name of ['live-model-eval.yml','promotion-model-eval.yml']){
    const workflow=fs.readFileSync(path.join(root,'.github','workflows',name),'utf8');
    assert.match(workflow,/uses: actions\/upload-artifact@[^\n]+\n\s+if: \$\{\{ always\(\) \}\}/);
  }
});
