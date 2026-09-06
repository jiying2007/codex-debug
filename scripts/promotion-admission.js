#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const corpus=require('../quality/promotion-corpus.json');
const defaultPolicy=require('../quality/promotion-admission-policy.json');
const {stableDigest,validateRecord,evaluate}=require('./model-evaluation');
const {validatePromotionCorpus,promotionReadiness,toEvaluationCorpus}=require('./promotion-corpus');
const {validateQualificationRecord}=require('./promotion-qualify');

const POLICY_VERSION=1;
const HEX64=/^[0-9a-f]{64}$/;
const SHA40=/^[0-9a-f]{40}$/;

function currentHead(root){return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function currentCore(root){return execFileSync('git',['ls-files','--stage','src/codex-safe-core'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split(/\s+/)[1];}
function finite01(value){return Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=1;}
function policyPayload(policy){const copy={...policy};delete copy.policyDigest;return copy;}

function validateAdmissionPolicy(policy=defaultPolicy){
  assert.equal(policy?.schemaVersion,POLICY_VERSION,'promotion admission policy schema mismatch');
  assert.equal(policy?.kind,'codex-debug-promotion-admission-policy','promotion admission policy kind mismatch');
  assert.equal(typeof policy?.reviewed,'boolean','promotion admission policy reviewed must be explicit');

  const safety=policy.safety||{};
  for(const key of ['maximumFalseSupport','maximumFalseFixCandidates','maximumPatchPolicyViolations']){
    assert.ok(Number.isInteger(safety[key])&&safety[key]>=0&&safety[key]<=1000,`invalid promotion admission safety ${key}`);
  }

  const quality=policy.quality||{};
  for(const key of ['minimumAssessmentAccuracy','minimumRootCauseTop1Accuracy','minimumInsufficientEvidenceAccuracy']){
    assert.ok(quality[key]===null||finite01(quality[key]),`invalid promotion admission quality ${key}`);
  }

  const token=policy.tokenEfficiency||{};
  assert.equal(typeof token.calibrated,'boolean','promotion admission token calibration state must be explicit');
  if(token.calibrated){
    assert.ok(Number.isFinite(Number(token.maximumTokensPerCase))&&Number(token.maximumTokensPerCase)>0&&Number(token.maximumTokensPerCase)<=1000000,'invalid calibrated maximumTokensPerCase');
  }else{
    assert.equal(token.maximumTokensPerCase,null,'uncalibrated token policy must not invent a maximumTokensPerCase');
  }

  if(policy.reviewed){
    for(const key of ['minimumAssessmentAccuracy','minimumRootCauseTop1Accuracy','minimumInsufficientEvidenceAccuracy']){
      assert.ok(finite01(quality[key]),`reviewed promotion policy requires ${key}`);
    }
    assert.equal(token.calibrated,true,'reviewed promotion policy requires token calibration');
  }

  assert.match(String(policy.policyDigest||''),HEX64,'invalid promotion admission policy digest');
  assert.equal(policy.policyDigest,stableDigest(policyPayload(policy)),'promotion admission policy digest mismatch');
  return policy;
}

function assertRunBinding(qualification,modelRecord){
  const q=qualification.runContext||{},m=modelRecord.runContext||{};
  for(const [label,ctx] of [['qualification',q],['model',m]]){
    assert.match(String(ctx.sourceSha||''),SHA40,`${label} runContext sourceSha is required`);
    assert.ok(String(ctx.runId||''),`${label} runContext runId is required`);
    assert.ok(String(ctx.runAttempt||''),`${label} runContext runAttempt is required`);
    assert.ok(String(ctx.workflow||''),`${label} runContext workflow is required`);
    assert.ok(String(ctx.event||''),`${label} runContext event is required`);
    assert.ok(String(ctx.repository||''),`${label} runContext repository is required`);
  }
  assert.equal(q.sourceSha,qualification.debugCommit,'qualification sourceSha must equal debugCommit');
  assert.equal(m.sourceSha,modelRecord.debugCommit,'model sourceSha must equal debugCommit');
  for(const key of ['sourceSha','runId','runAttempt','workflow','event','repository'])assert.equal(m[key],q[key],`qualification/model runContext mismatch: ${key}`);
}

function thresholdGap(gaps,actual,minimum,label){
  if(minimum===null||minimum===undefined){gaps.push(`${label} threshold is not reviewed`);return;}
  if(Number(actual)<Number(minimum))gaps.push(`${label} ${Number(actual).toFixed(6)} < ${Number(minimum).toFixed(6)}`);
}
function maximumGap(gaps,actual,maximum,label){if(Number(actual)>Number(maximum))gaps.push(`${label} ${Number(actual)} > ${Number(maximum)}`);}

function evaluateAdmission({
  policy=defaultPolicy,
  reviewedCorpus=corpus,
  qualification,
  modelRecord,
  expectedDebugCommit='',
  expectedCoreCommit='',
  requirePromotionEligible=false,
  recordedAt=new Date().toISOString()
}={}){
  validatePromotionCorpus(reviewedCorpus);
  validateAdmissionPolicy(policy);
  validateQualificationRecord(qualification,reviewedCorpus);

  const readiness=promotionReadiness(reviewedCorpus);
  const evaluationCorpus=toEvaluationCorpus(reviewedCorpus);
  validateRecord(evaluationCorpus,modelRecord,{requireLive:true});
  assert.equal(qualification.debugCommit,modelRecord.debugCommit,'qualification/model debugCommit mismatch');
  assert.equal(qualification.coreCommit,modelRecord.coreCommit,'qualification/model coreCommit mismatch');
  if(expectedDebugCommit)assert.equal(modelRecord.debugCommit,expectedDebugCommit,'promotion admission debugCommit is not current HEAD');
  if(expectedCoreCommit)assert.equal(modelRecord.coreCommit,expectedCoreCommit,'promotion admission coreCommit is not current gitlink');
  assertRunBinding(qualification,modelRecord);

  const summary=evaluate(evaluationCorpus,modelRecord,{requireLive:true});
  const gaps=[];
  if(!readiness.ready)gaps.push(...readiness.gaps.map(x=>`corpus ${x}`));
  if(qualification.readiness?.ready!==true)gaps.push('qualification readiness is not complete');
  if(policy.reviewed!==true)gaps.push('promotion admission policy is not reviewed');

  const q=policy.quality||{};
  thresholdGap(gaps,summary.assessmentAccuracy,q.minimumAssessmentAccuracy,'assessmentAccuracy');
  thresholdGap(gaps,summary.rootCauseTop1Accuracy,q.minimumRootCauseTop1Accuracy,'rootCauseTop1Accuracy');
  thresholdGap(gaps,summary.insufficientEvidenceAccuracy,q.minimumInsufficientEvidenceAccuracy,'insufficientEvidenceAccuracy');

  const s=policy.safety||{};
  maximumGap(gaps,summary.falseSupport,s.maximumFalseSupport,'falseSupport');
  maximumGap(gaps,summary.falseFixCandidates,s.maximumFalseFixCandidates,'falseFixCandidates');
  maximumGap(gaps,summary.patchPolicyViolations,s.maximumPatchPolicyViolations,'patchPolicyViolations');

  const token=policy.tokenEfficiency||{};
  if(token.calibrated!==true)gaps.push('token efficiency is not calibrated');
  else if(Number(summary.usage?.tokensPerCase)>Number(token.maximumTokensPerCase))gaps.push(`tokensPerCase ${Number(summary.usage.tokensPerCase).toFixed(2)} > ${Number(token.maximumTokensPerCase).toFixed(2)}`);

  if(requirePromotionEligible){
    if(reviewedCorpus.promotionEligible!==true)gaps.push('reviewed corpus promotionEligible is not true');
    if(modelRecord.promotionEligible!==true)gaps.push('live model record is not promotion eligible');
    if(summary.claimableLiveMetric!==true)gaps.push('live model metrics are not claimable promotion evidence');
  }

  const body={
    schemaVersion:POLICY_VERSION,
    kind:'codex-debug-promotion-admission',
    recordedAt:new Date(recordedAt).toISOString(),
    debugCommit:modelRecord.debugCommit,
    coreCommit:modelRecord.coreCommit,
    corpusDigest:stableDigest(reviewedCorpus),
    evaluationCorpusDigest:stableDigest(evaluationCorpus),
    policyDigest:policy.policyDigest,
    qualificationDigest:qualification.digest,
    modelRecordDigest:modelRecord.recordDigest,
    runContext:modelRecord.runContext,
    readiness,
    metrics:{
      assessmentAccuracy:summary.assessmentAccuracy,
      rootCauseTop1Accuracy:summary.rootCauseTop1Accuracy,
      insufficientEvidenceAccuracy:summary.insufficientEvidenceAccuracy,
      falseSupport:summary.falseSupport,
      falseFixCandidates:summary.falseFixCandidates,
      patchPolicyViolations:summary.patchPolicyViolations,
      tokensPerCase:summary.usage?.tokensPerCase??0
    },
    requirePromotionEligible:Boolean(requirePromotionEligible),
    ready:gaps.length===0,
    gaps
  };
  body.digest=stableDigest(body);
  return Object.freeze(body);
}

function parseArgs(argv){
  const out={policy:'quality/promotion-admission-policy.json',qualification:'',record:'',output:'PROMOTION_ADMISSION.json',validatePolicyOnly:false,requirePromotionEligible:false};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--policy')out.policy=argv[++i];
    else if(arg==='--qualification')out.qualification=argv[++i];
    else if(arg==='--record')out.record=argv[++i];
    else if(arg==='--output')out.output=argv[++i];
    else if(arg==='--validate-policy-only')out.validatePolicyOnly=true;
    else if(arg==='--require-promotion-eligible')out.requirePromotionEligible=true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function main(){
  const args=parseArgs(process.argv.slice(2));
  const policy=JSON.parse(fs.readFileSync(path.resolve(args.policy),'utf8'));
  validateAdmissionPolicy(policy);
  if(args.validatePolicyOnly){
    process.stdout.write(`${JSON.stringify({schemaVersion:POLICY_VERSION,reviewed:policy.reviewed,tokenCalibrated:policy.tokenEfficiency.calibrated,policyDigest:policy.policyDigest})}\n`);
    return;
  }
  if(!args.qualification||!args.record)throw new Error('--qualification and --record are required unless --validate-policy-only is used');
  const qualification=JSON.parse(fs.readFileSync(path.resolve(args.qualification),'utf8'));
  const modelRecord=JSON.parse(fs.readFileSync(path.resolve(args.record),'utf8'));
  const root=path.resolve(__dirname,'..');
  const admission=evaluateAdmission({policy,reviewedCorpus:corpus,qualification,modelRecord,expectedDebugCommit:currentHead(root),expectedCoreCommit:currentCore(root),requirePromotionEligible:args.requirePromotionEligible});
  fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(admission,null,2)}\n`,'utf8');
  process.stdout.write(`${JSON.stringify({output:path.resolve(args.output),ready:admission.ready,gaps:admission.gaps,digest:admission.digest})}\n`);
  if(args.requirePromotionEligible&&!admission.ready)process.exitCode=2;
}

if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={POLICY_VERSION,validateAdmissionPolicy,assertRunBinding,evaluateAdmission};
