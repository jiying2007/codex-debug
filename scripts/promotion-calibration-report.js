#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const corpus=require('../quality/promotion-corpus.json');
const defaultPolicy=require('../quality/promotion-admission-policy.json');
const {stableDigest,evaluate}=require('./model-evaluation');
const {toEvaluationCorpus}=require('./promotion-corpus');
const {validateAdmissionReceipt}=require('./validate-promotion-admission');

const HEX64=/^[0-9a-f]{64}$/;
const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function nearestRank(values,p){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),index=Math.max(0,Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1));
  return sorted[index];
}
function sumUsage(item){
  const phases=[item.execution?.hypothesis,item.execution?.causalVerification].filter(Boolean),sum=key=>phases.reduce((n,p)=>n+Number(p.usage?.[key]||0),0);
  return {inputTokens:sum('inputTokens'),outputTokens:sum('outputTokens'),totalTokens:sum('totalTokens'),cachedInputTokens:sum('cachedInputTokens')};
}
function lineage(modelRecord){
  const counts=new Map();
  for(const item of modelRecord.cases||[]){
    for(const [role,phase] of [['hypothesis',item.execution?.hypothesis],['causalVerification',item.execution?.causalVerification]]){
      if(!phase)continue;
      const value={role,model:String(phase.model||''),codexVersion:String(phase.codexVersion||''),providerMode:String(phase.providerMode||''),runtimeSource:String(phase.runtimeSource||'')},key=JSON.stringify(value);
      counts.set(key,{...value,cases:(counts.get(key)?.cases||0)+1});
    }
  }
  return [...counts.values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function buildCalibrationReport({policy=defaultPolicy,reviewedCorpus=corpus,qualification,modelRecord,admission,recordedAt=new Date().toISOString()}={}){
  validateAdmissionReceipt({admission,policy,reviewedCorpus,qualification,modelRecord,expectedDebugCommit:modelRecord.debugCommit,expectedCoreCommit:modelRecord.coreCommit});
  const evaluationCorpus=toEvaluationCorpus(reviewedCorpus),summary=evaluate(evaluationCorpus,modelRecord,{requireLive:true});
  const summaryById=new Map(summary.caseResults.map(x=>[x.id,x]));
  const cases=(modelRecord.cases||[]).map(item=>{
    const result=summaryById.get(item.caseId),usage=sumUsage(item),judgment=item.judgment||{};
    return {id:item.caseId,assessmentExpected:result.assessmentExpected,assessmentActual:result.assessmentActual,rootCauseHit:result.rootCauseHit,patchPolicy:result.patchPolicy,patchProposed:Boolean(judgment.patchProposed),patchDisposition:result.patchDisposition,patchApplicable:result.patchApplicable,falseFixCandidate:Boolean(result.falseFixCandidate),usage};
  });
  const tokens=cases.map(x=>x.usage.totalTokens),accepted=cases.filter(x=>x.patchDisposition==='accept');
  const report={
    schemaVersion:1,
    kind:'codex-debug-promotion-calibration-report',
    recordedAt:new Date(recordedAt).toISOString(),
    reviewInputOnly:true,
    authorizesPromotion:false,
    thresholdRecommendation:null,
    debugCommit:modelRecord.debugCommit,
    coreCommit:modelRecord.coreCommit,
    corpusDigest:stableDigest(reviewedCorpus),
    evaluationCorpusDigest:stableDigest(evaluationCorpus),
    policyDigest:policy.policyDigest,
    qualificationDigest:qualification.digest,
    modelRecordDigest:modelRecord.recordDigest,
    admissionDigest:admission.digest,
    runContext:modelRecord.runContext||{},
    admission:{ready:Boolean(admission.ready),gaps:[...(admission.gaps||[])]},
    metrics:{assessmentAccuracy:summary.assessmentAccuracy,rootCauseTop1Accuracy:summary.rootCauseTop1Accuracy,insufficientEvidenceAccuracy:summary.insufficientEvidenceAccuracy,falseSupport:summary.falseSupport,falseFixCandidates:summary.falseFixCandidates,patchPolicyViolations:summary.patchPolicyViolations},
    review:{
      assessmentMisses:cases.filter(x=>x.assessmentExpected!==x.assessmentActual).map(x=>x.id),
      rootCauseMisses:cases.filter(x=>x.rootCauseHit===false).map(x=>x.id),
      insufficientMisses:cases.filter(x=>x.assessmentExpected==='insufficient'&&x.assessmentActual!=='insufficient').map(x=>x.id),
      falseFixCases:cases.filter(x=>x.falseFixCandidate).map(x=>x.id),
      patch:{proposed:cases.filter(x=>x.patchProposed).length,accepted:accepted.length,rejected:cases.filter(x=>x.patchDisposition==='reject').length,none:cases.filter(x=>x.patchDisposition==='none').length,acceptedApplicable:accepted.filter(x=>x.patchApplicable===true).length,acceptedNonApplicable:accepted.filter(x=>x.patchApplicable===false).length,acceptedApplicabilityUnknown:accepted.filter(x=>x.patchApplicable===null).length},
      tokenDistribution:{cases:tokens.length,totalTokens:tokens.reduce((a,b)=>a+b,0),meanTokensPerCase:tokens.length?tokens.reduce((a,b)=>a+b,0)/tokens.length:0,p50TokensPerCase:nearestRank(tokens,0.50),p95TokensPerCase:nearestRank(tokens,0.95),maxTokensPerCase:tokens.length?Math.max(...tokens):null},
      lineage:lineage(modelRecord)
    },
    cases
  };
  report.digest=stableDigest(report);
  return Object.freeze(report);
}
function validateCalibrationReport(report){
  assert.equal(report?.schemaVersion,1,'calibration report schema mismatch');
  assert.equal(report?.kind,'codex-debug-promotion-calibration-report','calibration report kind mismatch');
  assert.equal(report?.reviewInputOnly,true,'calibration report must remain review-input-only');
  assert.equal(report?.authorizesPromotion,false,'calibration report must never authorize promotion');
  assert.equal(report?.thresholdRecommendation,null,'calibration report must not auto-recommend thresholds');
  assert.ok(ISO_UTC.test(String(report?.recordedAt||''))&&new Date(report.recordedAt).toISOString()===report.recordedAt,'calibration recordedAt must be canonical UTC');
  for(const key of ['corpusDigest','evaluationCorpusDigest','policyDigest','qualificationDigest','modelRecordDigest','admissionDigest','digest'])assert.match(String(report?.[key]||''),HEX64,`invalid calibration ${key}`);
  const copy={...report};delete copy.digest;assert.equal(report.digest,stableDigest(copy),'calibration report self digest mismatch');
  return report;
}
function parseArgs(argv){const out={policy:'PROMOTION_ADMISSION_POLICY.json',qualification:'PROMOTION_CORPUS_QUALIFICATION.json',record:'PROMOTION_MODEL_EVAL.json',admission:'PROMOTION_ADMISSION.json',output:'PROMOTION_CALIBRATION_REPORT.json'};for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--policy')out.policy=argv[++i];else if(arg==='--qualification')out.qualification=argv[++i];else if(arg==='--record')out.record=argv[++i];else if(arg==='--admission')out.admission=argv[++i];else if(arg==='--output')out.output=argv[++i];else throw new Error(`Unknown argument: ${arg}`);}return out;}
function main(){
  const args=parseArgs(process.argv.slice(2)),read=file=>JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
  const report=buildCalibrationReport({policy:read(args.policy),reviewedCorpus:corpus,qualification:read(args.qualification),modelRecord:read(args.record),admission:read(args.admission)});
  validateCalibrationReport(report);fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(report,null,2)}\n`,'utf8');
  process.stdout.write(`${JSON.stringify({output:path.resolve(args.output),reviewInputOnly:true,authorizesPromotion:false,assessmentAccuracy:report.metrics.assessmentAccuracy,rootCauseTop1Accuracy:report.metrics.rootCauseTop1Accuracy,insufficientEvidenceAccuracy:report.metrics.insufficientEvidenceAccuracy,p50TokensPerCase:report.review.tokenDistribution.p50TokensPerCase,p95TokensPerCase:report.review.tokenDistribution.p95TokensPerCase,maxTokensPerCase:report.review.tokenDistribution.maxTokensPerCase,digest:report.digest})}\n`);
}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={nearestRank,sumUsage,lineage,buildCalibrationReport,validateCalibrationReport};
