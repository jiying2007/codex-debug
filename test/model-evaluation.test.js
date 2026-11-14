'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const corpus=require('../quality/model-eval-contract-corpus.json');
const record=require('../quality/model-eval-contract-results.json');
const {stableDigest,normalizedUsage,phaseEvidence,validateCorpus,validateRecord,evaluate}=require('../scripts/model-evaluation');
require('../scripts/model-eval-contract');
require('../scripts/live-model-eval');

function clone(value){return JSON.parse(JSON.stringify(value));}
function resign(value){const copy={...value};delete copy.recordDigest;value.recordDigest=stableDigest(copy);return value;}

test('contract fixture evaluates perfectly without becoming a live metric',()=>{
  const result=evaluate(corpus,record);
  assert.equal(result.assessmentAccuracy,1);
  assert.equal(result.rootCauseTop1Accuracy,1);
  assert.equal(result.insufficientEvidenceAccuracy,1);
  assert.equal(result.falseSupport,0);
  assert.equal(result.falseFixCandidates,0);
  assert.equal(result.patchPolicyViolations,0);
  assert.equal(result.claimableLiveMetric,false);
});

test('corpus expectation tampering fails before evaluation',()=>{
  const changed=clone(corpus);
  changed.cases[0].expected.assessment='contradicted';
  assert.throws(()=>validateCorpus(changed),/expectation digest mismatch/);
});

test('record tampering is detected by the self digest',()=>{
  const changed=clone(record);
  changed.cases[0].judgment.causalAssessment='insufficient';
  assert.throws(()=>validateRecord(corpus,changed),/record digest mismatch/);
});

test('contract fixture cannot satisfy a live-evidence requirement',()=>{
  assert.throws(()=>evaluate(corpus,record,{requireLive:true}),/live model evidence is required/);
});

test('usage normalization preserves complete provider observations and explicit zero',()=>{
  assert.deepEqual(normalizedUsage({input_tokens:100,output_tokens:20,cached_input_tokens:40}),{inputTokens:100,outputTokens:20,totalTokens:120,cachedInputTokens:40});
  assert.deepEqual(normalizedUsage({inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0}),{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0});
  assert.deepEqual(normalizedUsage({input:10,output:2}),{inputTokens:10,outputTokens:2,totalTokens:12});
});

test('usage normalization keeps missing or invalid observations unknown',()=>{
  const invalid=[undefined,null,[],{},0,'0',{totalTokens:2},{inputTokens:1},{outputTokens:1},
    {inputTokens:null,outputTokens:0},{inputTokens:'1',outputTokens:0},{inputTokens:false,outputTokens:0},
    {inputTokens:-1,outputTokens:2},{inputTokens:0.5,outputTokens:1},{inputTokens:NaN,outputTokens:0},
    {inputTokens:Infinity,outputTokens:0},{inputTokens:Number.MAX_SAFE_INTEGER+1,outputTokens:0},
    {inputTokens:Number.MAX_SAFE_INTEGER,outputTokens:1},{inputTokens:1,outputTokens:1,totalTokens:0},
    {inputTokens:1,outputTokens:1,totalTokens:'2'},{inputTokens:1,outputTokens:1,totalTokens:null},
    {inputTokens:1,outputTokens:1,cachedInputTokens:2},{inputTokens:1,outputTokens:1,cachedInputTokens:null},
    {inputTokens:1,input_tokens:2,outputTokens:0},{inputTokens:1,input_tokens:null,outputTokens:0}];
  for(const usage of invalid){assert.equal(normalizedUsage(usage),null,JSON.stringify(usage));assert.equal(phaseEvidence({usage}).usage,null);}
});

test('live evaluation rejects missing or malformed usage in either model phase',()=>{
  const invalid=[undefined,null,{}, {inputTokens:1,outputTokens:1},
    {inputTokens:1,outputTokens:1,totalTokens:0},{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:2},
    {inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:'0'},
    {inputTokens:'1',outputTokens:1,totalTokens:2},{inputTokens:null,outputTokens:0,totalTokens:0},
    {inputTokens:0,outputTokens:-1,totalTokens:-1},{inputTokens:1.5,outputTokens:0,totalTokens:1.5},
    {inputTokens:0,outputTokens:0,totalTokens:NaN},{inputTokens:Infinity,outputTokens:0,totalTokens:Infinity}];
  for(const role of ['hypothesis','causalVerification'])for(const usage of invalid){
    const changed=clone(record);changed.source='live';changed.cases[0].execution[role].usage=usage;resign(changed);
    assert.throws(()=>validateRecord(corpus,changed,{requireLive:true}),/complete valid usage is required/);
    assert.throws(()=>evaluate(corpus,changed,{requireLive:true}),/complete valid usage is required/);
  }
});

test('live evaluation accepts explicit zero without inventing an unreported cached count',()=>{
  const changed=clone(record);changed.source='live';
  for(const item of changed.cases)for(const phase of Object.values(item.execution))phase.usage={inputTokens:0,outputTokens:0,totalTokens:0};
  resign(changed);const result=evaluate(corpus,changed,{requireLive:true});
  assert.equal(result.usage.totalTokens,0);assert.equal(result.usage.tokensPerCase,0);assert.equal(result.usage.cachedInputTokens,null);
  for(const item of changed.cases)for(const phase of Object.values(item.execution))phase.usage.cachedInputTokens=0;
  resign(changed);assert.equal(evaluate(corpus,changed,{requireLive:true}).usage.cachedInputTokens,0);
});

test('evaluation rejects token totals whose aggregation loses integer precision',()=>{
  const changed=clone(record);changed.source='live';
  for(const phase of Object.values(changed.cases[0].execution))phase.usage={inputTokens:Number.MAX_SAFE_INTEGER,outputTokens:0,totalTokens:Number.MAX_SAFE_INTEGER};
  resign(changed);assert.throws(()=>evaluate(corpus,changed,{requireLive:true}),/aggregate usage exceeds safe integer range/);
});

test('promotion eligibility requires both live source and promotion corpus',()=>{
  const changed=clone(record);changed.source='live';changed.promotionEligible=true;resign(changed);
  assert.throws(()=>validateRecord(corpus,changed),/promotion evidence requires a promotion corpus/);
});

test('forbidden accepted or non-applicable patch is counted as false-fix evidence',()=>{
  const changed=clone(record);
  const item=changed.cases.find(x=>x.caseId==='insufficient-external-500');
  item.judgment.patchProposed=true;item.judgment.patchDisposition='accept';item.judgment.patchApplicable=false;
  item.judgment.rootCauseDigest=stableDigest(item.judgment.rootCauseText);resign(changed);
  const result=evaluate(corpus,changed);
  assert.equal(result.falseFixCandidates,1);
  assert.equal(result.patchPolicyViolations,1);
});

test('live model workflow is manual read-only fail-closed evidence, never promotion authority',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','live-model-eval.yml'),'utf8');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/permissions:\s*\n\s+contents:\s*read\b/);
  assert.match(workflow,/secrets\.OPENAI_API_KEY/);
  assert.match(workflow,/refusing to claim a live-model evaluation/);
  assert.match(workflow,/promotionEligible/);
  assert.match(workflow,/--require-live/);
  for(const forbidden of [/\bcontents:\s*write\b/i,/\bid-token:\s*write\b/i,/\bnpm\s+publish\b/i,/\bvsce\s+publish\b/i,/\bgh\s+release\b/i,/\bgit\s+push\b/i])assert.doesNotMatch(workflow,forbidden);
});
