#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const corpus=require('../quality/promotion-corpus.json');
const {runDebugSession}=require('../src/debug');
const {runReproductionSeries}=require('../src/reproduction');
const {inspectRuntimeFromOptions}=require('../src/codex');
const {stableDigest,resultCase,createRecord,evaluate}=require('./model-evaluation');
const {validatePromotionCorpus,promotionReadiness,toEvaluationCorpus}=require('./promotion-corpus');
const {materializeHistoricalCase}=require('./historical-case');

function gitlink(root){const {execFileSync}=require('node:child_process');return execFileSync('git',['ls-files','--stage','src/codex-safe-core'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split(/\s+/)[1];}
function head(root){const {execFileSync}=require('node:child_process');return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function optionsFromEnv(workspace,item){const explicit=String(process.env.CODEX_DEBUG_MODEL||'').trim();return {workspace,codexPath:process.env.CODEX_PATH||'codex',model:explicit,verifierModel:String(process.env.CODEX_DEBUG_VERIFIER_MODEL||''),modelSelectionStrategy:String(process.env.CODEX_DEBUG_MODEL_SELECTION_STRATEGY||(explicit?'fixed':'auto')),modelCompatibilityPolicy:String(process.env.CODEX_DEBUG_MODEL_COMPATIBILITY_POLICY||'strict'),providerMode:String(process.env.CODEX_DEBUG_PROVIDER_MODE||'openai'),providerBaseUrl:String(process.env.CODEX_DEBUG_PROVIDER_BASE_URL||''),providerApiKeyEnv:String(process.env.CODEX_DEBUG_PROVIDER_API_KEY_ENV||'OPENAI_API_KEY'),providerCredentialSource:String(process.env.CODEX_DEBUG_PROVIDER_CREDENTIAL_SOURCE||'auto'),providerAllowInsecureHttp:false,maxEstimatedTokens:Number(process.env.CODEX_DEBUG_MAX_ESTIMATED_TOKENS||80000),commandTimeoutMs:item.reproduction.timeoutMs,maxLogBytes:4*1024*1024,includeGitHistory:true,persist:false,kind:item.failureKind};}
function modelEvidenceForCase(item,observed){
  const commandDigest=stableDigest(item.reproduction.command);
  if(item.mode!=='historical-projected')return Object.freeze({
    text:[`Controller-observed historical failure for reviewed case ${item.id}. Exact reproduction command digest: ${commandDigest}. Ground-truth fix is intentionally withheld from the model.`,observed.representative.stdout||'',observed.representative.stderr||''].join('\n'),
    sourceType:'historical-observed',
    sourceLabel:`reviewed historical case ${item.id}`,
    includeGitHistory:true
  });
  const s=observed.summary||{};
  const runs=Math.max(0,Number(s.runs)||0),failures=Math.max(0,Number(s.failures)||0),timeouts=Math.max(0,Number(s.timeouts)||0);
  return Object.freeze({
    text:[
      'Controller-observed historical reproduction failed under a reviewed summary-only evidence projection.',
      `Failure category: ${item.failureKind}.`,
      `Observed runs: ${runs}; failures: ${failures}; timeouts: ${timeouts}.`,
      `Exact reproduction command digest: ${commandDigest}.`,
      'Raw stdout/stderr, source anchors, Git history, case identity, and the reviewed fix are unavailable in this model-visible evidence.'
    ].join('\n'),
    sourceType:'historical-projected',
    sourceLabel:'reviewed historical projected evidence',
    includeGitHistory:false
  });
}
function assertProjectedEvidenceBoundary(item,visible){
  if(item.mode!=='historical-projected')return visible;
  const text=String(visible?.text||'').toLowerCase();
  const forbidden=[item.id,item.fixedCommit,item.groundTruth?.summary,...(item.groundTruth?.files||[])].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean);
  for(const value of forbidden)if(value.length>=4&&text.includes(value))throw new Error(`projected model evidence leaks reviewed ground truth for ${item.id}`);
  if(visible.includeGitHistory!==false)throw new Error(`projected model evidence must disable Git history for ${item.id}`);
  if(visible.sourceType!=='historical-projected')throw new Error(`projected model evidence sourceType mismatch for ${item.id}`);
  return visible;
}
function decorateExecution(result,options){const runtime=inspectRuntimeFromOptions(options),providerMode=String(runtime.providerId||runtime.runtime?.provider?.mode||options.providerMode||'');const phase=x=>x?{...x,provider:x.provider||{mode:providerMode},runtimeSource:x.runtimeSource||runtime.source||'resolved-runtime'}:null;return {...result,execution:{hypothesis:phase(result.execution?.hypothesis),causalVerification:phase(result.execution?.causalVerification)}};}
function withRunContext(record){const copy={...record};delete copy.recordDigest;copy.runContext={workflow:String(process.env.GITHUB_WORKFLOW||''),runId:String(process.env.GITHUB_RUN_ID||''),runAttempt:String(process.env.GITHUB_RUN_ATTEMPT||''),event:String(process.env.GITHUB_EVENT_NAME||''),repository:String(process.env.GITHUB_REPOSITORY||''),sourceSha:String(process.env.GITHUB_SHA||'')};copy.recordDigest=stableDigest(copy);return Object.freeze(copy);}
function parseArgs(argv){const out={output:'PROMOTION_MODEL_EVAL.json',summary:'PROMOTION_MODEL_EVAL_SUMMARY.json',transitions:'PROMOTION_TRANSITIONS.json',requirePromotionReady:false};for(let i=0;i<argv.length;i++){if(argv[i]==='--output')out.output=argv[++i];else if(argv[i]==='--summary')out.summary=argv[++i];else if(argv[i]==='--transitions')out.transitions=argv[++i];else if(argv[i]==='--require-promotion-ready')out.requirePromotionReady=true;else throw new Error(`Unknown argument: ${argv[i]}`);}return out;}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  validatePromotionCorpus(corpus);
  const readiness=promotionReadiness(corpus);
  if(args.requirePromotionReady&&!readiness.ready)throw new Error(`promotion corpus is not ready: ${readiness.gaps.join('; ')}`);
  if(args.requirePromotionReady&&!corpus.promotionEligible)throw new Error('promotion corpus readiness is insufficient without explicit promotionEligible=true review.');
  const evaluationCorpus=toEvaluationCorpus(corpus),cases=[],transitions=[];
  for(const item of corpus.cases){
    const materialized=materializeHistoricalCase(item);
    try{
      const observed=runReproductionSeries(item.reproduction.command,{runs:item.reproduction.runs,cwd:materialized.repo,timeoutMs:item.reproduction.timeoutMs,maxBuffer:4*1024*1024,env:materialized.env});
      if(!observed.summary.reproducibleFailure)throw new Error(`historical failure disappeared before model analysis for ${item.id}`);
      const visible=assertProjectedEvidenceBoundary(item,modelEvidenceForCase(item,observed));
      const options={...optionsFromEnv(materialized.repo,item),text:visible.text,sourceType:visible.sourceType,sourceLabel:visible.sourceLabel,includeGitHistory:visible.includeGitHistory};
      const result=decorateExecution(await runDebugSession(options),options);
      const patchApplicable=result.investigation?.patch?Boolean(result.patch?.checked):null;
      cases.push(resultCase(item,result,{patchApplicable}));
      transitions.push(materialized.transition);
    }finally{materialized.cleanup();}
  }
  const repoRoot=path.resolve(__dirname,'..'),base=createRecord({source:'live',promotionEligible:Boolean(corpus.promotionEligible&&readiness.ready),debugCommit:head(repoRoot),coreCommit:gitlink(repoRoot),corpus:evaluationCorpus,cases}),record=withRunContext(base),summary=evaluate(evaluationCorpus,record,{requireLive:true,requirePromotionEligible:args.requirePromotionReady});
  const transitionBody={schemaVersion:1,kind:'codex-debug-promotion-transitions',corpusDigest:stableDigest(corpus),debugCommit:record.debugCommit,cases:transitions};transitionBody.digest=stableDigest(transitionBody);
  fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(record,null,2)}\n`,'utf8');
  fs.writeFileSync(path.resolve(args.summary),`${JSON.stringify({...summary,promotionReadiness:readiness},null,2)}\n`,'utf8');
  fs.writeFileSync(path.resolve(args.transitions),`${JSON.stringify(transitionBody,null,2)}\n`,'utf8');
  process.stdout.write(`${JSON.stringify({cases:cases.length,debugCommit:record.debugCommit,coreCommit:record.coreCommit,readyForPromotion:readiness.ready,promotionEligible:record.promotionEligible,claimableLiveMetric:summary.claimableLiveMetric,falseSupport:summary.falseSupport,falseFixCandidates:summary.falseFixCandidates,patchPolicyViolations:summary.patchPolicyViolations,usage:summary.usage})}\n`);
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=2;});
module.exports={optionsFromEnv,modelEvidenceForCase,assertProjectedEvidenceBoundary,decorateExecution,withRunContext};
