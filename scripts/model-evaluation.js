#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const MODEL_EVAL_VERSION=1;
const HEX64=/^[0-9a-f]{64}$/;
const SHA40=/^[0-9a-f]{40}$/;
const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ASSESSMENTS=new Set(['supported','insufficient','contradicted']);
const PATCH_POLICIES=new Set(['required','optional','forbidden']);

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>[k,stable(value[k])]));
  return value;
}
function stableDigest(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function number(value){const n=Number(value);return Number.isFinite(n)&&n>=0?n:0;}
function normalizedUsage(usage={}){
  const input=number(usage.inputTokens??usage.input_tokens??usage.input);
  const output=number(usage.outputTokens??usage.output_tokens??usage.output);
  const total=number(usage.totalTokens??usage.total_tokens)||(input+output);
  const cachedInput=number(usage.cachedInputTokens??usage.cached_input_tokens??usage.cached_input);
  return Object.freeze({inputTokens:input,outputTokens:output,totalTokens:total,cachedInputTokens:cachedInput});
}
function phaseEvidence(phase){
  if(!phase)return null;
  const provider=phase.provider||{};
  const providerMode=String(provider.mode||provider.providerId||provider.id||provider.name||'').slice(0,120);
  return Object.freeze({
    model:String(phase.model||'').slice(0,240),
    codexVersion:String(phase.codexVersion||'').slice(0,120),
    providerMode,
    runtimeSource:String(phase.runtimeSource||'').slice(0,120),
    modelEvidenceDigest:phase.modelEvidence?stableDigest(phase.modelEvidence):'',
    usage:normalizedUsage(phase.usage||{}),
    requestEstimate:phase.requestEstimate?{estimatedInputTokens:number(phase.requestEstimate.estimatedInputTokens??phase.requestEstimate.inputTokens),estimatedOutputTokens:number(phase.requestEstimate.estimatedOutputTokens??phase.requestEstimate.outputTokens),estimatedTotalTokens:number(phase.requestEstimate.estimatedTotalTokens??phase.requestEstimate.totalTokens)}:null,
    durationMs:number(phase.durationMs)
  });
}
function validateCorpus(corpus){
  assert.equal(corpus?.schemaVersion,MODEL_EVAL_VERSION,'model evaluation corpus schema mismatch');
  assert.equal(corpus?.kind,'codex-debug-model-eval-corpus','model evaluation corpus kind mismatch');
  assert.equal(typeof corpus?.promotionEligible,'boolean','corpus promotionEligible must be explicit');
  assert.ok(String(corpus?.provenance||''),'corpus provenance is required');
  assert.ok(Array.isArray(corpus?.cases)&&corpus.cases.length>0,'model evaluation corpus must have cases');
  const ids=new Set();
  for(const item of corpus.cases){
    assert.match(String(item.id||''),/^[a-z0-9][a-z0-9._-]{2,79}$/,'invalid model evaluation case id');
    assert.ok(!ids.has(item.id),`duplicate model evaluation case ${item.id}`);ids.add(item.id);
    const expected=item.expected||{};
    assert.ok(ASSESSMENTS.has(expected.assessment),`invalid expected assessment for ${item.id}`);
    assert.ok(PATCH_POLICIES.has(expected.patchPolicy),`invalid patch policy for ${item.id}`);
    assert.ok(Array.isArray(expected.rootCauseTerms),`rootCauseTerms must be an array for ${item.id}`);
    for(const term of expected.rootCauseTerms)assert.ok(String(term).trim().length>=2&&String(term).length<=120,`invalid root-cause term for ${item.id}`);
    assert.equal(item.expectationDigest,stableDigest(expected),`expectation digest mismatch for ${item.id}`);
  }
  return corpus;
}
function resultCase(caseSpec,result,{patchApplicable=null}={}){
  const investigation=result?.investigation||{};
  const causal=investigation.causalVerification||{};
  const rootCauseText=String(investigation.rootCause||'').slice(0,3000);
  const supportedHypotheses=(investigation.hypotheses||[]).filter(h=>h.status==='supported').map(h=>String(h.claim||h.title||'').slice(0,1200)).slice(0,8);
  const patchProposed=Boolean(investigation.patch);
  const patchDisposition=String(causal.patchDisposition||'none');
  return Object.freeze({
    caseId:caseSpec.id,
    evidenceDigest:String(result?.evidence?.digest||''),
    expectationDigest:caseSpec.expectationDigest,
    judgment:{rootCauseText,rootCauseDigest:stableDigest(rootCauseText),causalAssessment:String(causal.rootCauseAssessment||'insufficient'),patchProposed,patchDisposition,patchApplicable:patchApplicable===null?null:Boolean(patchApplicable),supportedHypotheses},
    execution:{hypothesis:phaseEvidence(result?.execution?.hypothesis),causalVerification:phaseEvidence(result?.execution?.causalVerification)}
  });
}
function createRecord({source='contract-fixture',promotionEligible=false,debugCommit,coreCommit,corpus,cases,recordedAt=new Date().toISOString()}={}){
  validateCorpus(corpus);
  const record={schemaVersion:MODEL_EVAL_VERSION,kind:'codex-debug-model-evaluation',source:String(source),promotionEligible:Boolean(promotionEligible),recordedAt:new Date(recordedAt).toISOString(),debugCommit:String(debugCommit||''),coreCommit:String(coreCommit||''),corpusDigest:stableDigest(corpus),cases:Array.isArray(cases)?cases:[]};
  if(record.source!=='live'&&record.promotionEligible)throw new Error('Only a live record may be promotion eligible.');
  if(record.promotionEligible&&!corpus.promotionEligible)throw new Error('A non-promotion corpus cannot create promotion-eligible evidence.');
  record.recordDigest=stableDigest(record);
  return Object.freeze(record);
}
function validateRecord(corpus,record,{requireLive=false,requirePromotionEligible=false}={}){
  validateCorpus(corpus);
  assert.equal(record?.schemaVersion,MODEL_EVAL_VERSION,'model evaluation record schema mismatch');
  assert.equal(record?.kind,'codex-debug-model-evaluation','model evaluation record kind mismatch');
  assert.ok(['live','contract-fixture'].includes(record?.source),'model evaluation source must be live or contract-fixture');
  if(requireLive)assert.equal(record.source,'live','live model evidence is required');
  if(requirePromotionEligible)assert.equal(record.promotionEligible,true,'promotion-eligible live model evidence is required');
  if(record.promotionEligible){assert.equal(record.source,'live','promotion evidence must be live');assert.equal(corpus.promotionEligible,true,'promotion evidence requires a promotion corpus');}
  assert.match(String(record.debugCommit||''),SHA40,'invalid debug commit');
  assert.match(String(record.coreCommit||''),SHA40,'invalid core commit');
  assert.ok(ISO_UTC.test(String(record.recordedAt||''))&&new Date(record.recordedAt).toISOString()===record.recordedAt,'recordedAt must be canonical UTC');
  assert.equal(record.corpusDigest,stableDigest(corpus),'corpus digest mismatch');
  const copy={...record};delete copy.recordDigest;assert.equal(record.recordDigest,stableDigest(copy),'model evaluation record digest mismatch');
  const expectedIds=corpus.cases.map(x=>x.id).sort(),actualIds=(record.cases||[]).map(x=>x.caseId).sort();assert.deepEqual(actualIds,expectedIds,'model evaluation case set mismatch');
  const map=new Map(corpus.cases.map(x=>[x.id,x]));
  for(const item of record.cases){
    const spec=map.get(item.caseId);assert.ok(spec,`unknown model evaluation case ${item.caseId}`);
    assert.match(String(item.evidenceDigest||''),HEX64,`invalid evidence digest for ${item.caseId}`);
    assert.equal(item.expectationDigest,spec.expectationDigest,`expectation digest mismatch for ${item.caseId}`);
    assert.match(String(item.judgment?.rootCauseDigest||''),HEX64,`invalid root-cause digest for ${item.caseId}`);
    assert.equal(item.judgment.rootCauseDigest,stableDigest(String(item.judgment.rootCauseText||'')),`root-cause digest mismatch for ${item.caseId}`);
    assert.ok(ASSESSMENTS.has(item.judgment?.causalAssessment),`invalid causal assessment for ${item.caseId}`);
    assert.ok(['accept','reject','none'].includes(item.judgment?.patchDisposition),`invalid patch disposition for ${item.caseId}`);
    for(const phase of [item.execution?.hypothesis,item.execution?.causalVerification]){
      assert.ok(phase,`both model phases are required for ${item.caseId}`);
      assert.ok(String(phase.model||''),`model identity missing for ${item.caseId}`);
      assert.ok(String(phase.codexVersion||''),`Codex version missing for ${item.caseId}`);
      assert.ok(String(phase.runtimeSource||''),`runtime source missing for ${item.caseId}`);
      if(phase.modelEvidenceDigest)assert.match(phase.modelEvidenceDigest,HEX64,`invalid model evidence digest for ${item.caseId}`);
      assert.ok(number(phase.usage?.totalTokens)>=0,`usage must be numeric for ${item.caseId}`);
    }
  }
  return record;
}
function evaluate(corpus,record,options={}){
  validateRecord(corpus,record,options);
  const specs=new Map(corpus.cases.map(x=>[x.id,x]));
  let assessmentHits=0,rootCauseTotal=0,rootCauseHits=0,insufficientTotal=0,insufficientHits=0,falseSupport=0,patchPolicyViolations=0,falseFixCandidates=0,inputTokens=0,outputTokens=0,totalTokens=0,cachedInputTokens=0;
  const cases=[];
  for(const item of record.cases){
    const expected=specs.get(item.caseId).expected,judgment=item.judgment||{},haystack=[judgment.rootCauseText,...(judgment.supportedHypotheses||[])].join('\n').toLowerCase();
    const terms=(expected.rootCauseTerms||[]).map(x=>String(x).toLowerCase()),rootCauseHit=terms.length?terms.every(term=>haystack.includes(term)):null;
    if(expected.assessment===judgment.causalAssessment)assessmentHits++;
    if(terms.length){rootCauseTotal++;if(rootCauseHit)rootCauseHits++;}
    if(expected.assessment==='insufficient'){insufficientTotal++;if(judgment.causalAssessment==='insufficient')insufficientHits++;}
    if(expected.assessment!=='supported'&&judgment.causalAssessment==='supported')falseSupport++;
    const forbiddenPatch=expected.patchPolicy==='forbidden'&&(judgment.patchProposed||judgment.patchDisposition==='accept');if(forbiddenPatch)patchPolicyViolations++;
    const falseFix=judgment.patchDisposition==='accept'&&(expected.assessment!=='supported'||expected.patchPolicy==='forbidden'||judgment.patchApplicable===false);if(falseFix)falseFixCandidates++;
    for(const phase of [item.execution.hypothesis,item.execution.causalVerification]){const u=phase.usage||{};inputTokens+=number(u.inputTokens);outputTokens+=number(u.outputTokens);totalTokens+=number(u.totalTokens);cachedInputTokens+=number(u.cachedInputTokens);}
    cases.push({id:item.caseId,assessmentExpected:expected.assessment,assessmentActual:judgment.causalAssessment,rootCauseHit,patchPolicy:expected.patchPolicy,patchDisposition:judgment.patchDisposition,patchApplicable:judgment.patchApplicable,falseFixCandidate:falseFix});
  }
  const count=record.cases.length;
  return Object.freeze({schemaVersion:MODEL_EVAL_VERSION,source:record.source,promotionEligible:Boolean(record.promotionEligible&&corpus.promotionEligible),claimableLiveMetric:Boolean(record.source==='live'&&record.promotionEligible&&corpus.promotionEligible),cases:count,assessmentAccuracy:count?assessmentHits/count:0,rootCauseTop1Accuracy:rootCauseTotal?rootCauseHits/rootCauseTotal:null,insufficientEvidenceAccuracy:insufficientTotal?insufficientHits/insufficientTotal:null,falseSupport,falseFixCandidates,patchPolicyViolations,usage:{inputTokens,outputTokens,totalTokens,cachedInputTokens,tokensPerCase:count?totalTokens/count:0},caseResults:cases});
}
function parseArgs(argv){const out={};for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--corpus')out.corpus=argv[++i];else if(arg==='--record')out.record=argv[++i];else if(arg==='--require-live')out.requireLive=true;else if(arg==='--require-promotion-eligible')out.requirePromotionEligible=true;else throw new Error(`Unknown argument: ${arg}`);}return out;}
function main(){const args=parseArgs(process.argv.slice(2));if(!args.corpus||!args.record)throw new Error('--corpus and --record are required');const corpus=JSON.parse(fs.readFileSync(path.resolve(args.corpus),'utf8')),record=JSON.parse(fs.readFileSync(path.resolve(args.record),'utf8')),summary=evaluate(corpus,record,args);process.stdout.write(`${JSON.stringify(summary)}\n`);}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={MODEL_EVAL_VERSION,stable,stableDigest,normalizedUsage,phaseEvidence,validateCorpus,resultCase,createRecord,validateRecord,evaluate};
