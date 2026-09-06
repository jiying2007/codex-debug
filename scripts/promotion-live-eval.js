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
      const failureText=[`Controller-observed historical failure for reviewed case ${item.id}. Exact reproduction command digest: ${stableDigest(item.reproduction.command)}. Ground-truth fix is intentionally withheld from the model.`,observed.representative.stdout||'',observed.representative.stderr||''].join('\n');
      const options={...optionsFromEnv(materialized.repo,item),text:failureText,sourceType:'historical-observed',sourceLabel:`reviewed historical case ${item.id}`};
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
module.exports={optionsFromEnv,decorateExecution,withRunContext};
