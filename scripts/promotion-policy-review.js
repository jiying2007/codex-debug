#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const corpus=require('../quality/promotion-corpus.json');
const defaultPolicy=require('../quality/promotion-admission-policy.json');
const {stableDigest}=require('./model-evaluation');
const {toEvaluationCorpus}=require('./promotion-corpus');
const {validateAdmissionPolicy}=require('./promotion-admission');
const {validateCalibrationReport}=require('./promotion-calibration-report');

const SHA40=/^[0-9a-f]{40}$/;

function finite01(value){return Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=1;}
function currentCore(root){return execFileSync('git',['ls-files','--stage','src/codex-safe-core'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split(/\s+/)[1];}
function copy(value){return JSON.parse(JSON.stringify(value));}

function calibrationEvidenceFromReport(report){
  return {
    reportDigest:report.digest,
    debugCommit:report.debugCommit,
    coreCommit:report.coreCommit,
    corpusDigest:report.corpusDigest,
    evaluationCorpusDigest:report.evaluationCorpusDigest,
    qualificationDigest:report.qualificationDigest,
    modelRecordDigest:report.modelRecordDigest,
    admissionDigest:report.admissionDigest,
    runContext:{...(report.runContext||{})}
  };
}

function buildReviewedPolicy({
  report,
  minimumAssessmentAccuracy,
  minimumRootCauseTop1Accuracy,
  maximumTokensPerCase,
  basePolicy=defaultPolicy,
  reviewedCorpus=corpus,
  expectedCoreCommit=''
}={}){
  validateCalibrationReport(report);
  assert.match(String(report.debugCommit||''),SHA40,'calibration report debugCommit is invalid');
  assert.match(String(report.coreCommit||''),SHA40,'calibration report coreCommit is invalid');
  assert.equal(report.runContext?.workflow,'Promotion Model Evaluation','calibration report must come from Promotion Model Evaluation');
  assert.equal(report.runContext?.event,'workflow_dispatch','calibration report must come from workflow_dispatch');
  assert.equal(report.runContext?.sourceSha,report.debugCommit,'calibration report sourceSha must equal debugCommit');

  const evaluationCorpus=toEvaluationCorpus(reviewedCorpus);
  assert.equal(report.corpusDigest,stableDigest(reviewedCorpus),'calibration report is stale for the reviewed corpus');
  assert.equal(report.evaluationCorpusDigest,stableDigest(evaluationCorpus),'calibration report is stale for the evaluation corpus');
  if(expectedCoreCommit)assert.equal(report.coreCommit,expectedCoreCommit,'calibration report is stale for the current Safe Core gitlink');

  assert.equal(Number(report.metrics?.falseSupport||0),0,'reviewed policy cannot be generated from calibration with false support');
  assert.equal(Number(report.metrics?.falseFixCandidates||0),0,'reviewed policy cannot be generated from calibration with false-fix candidates');
  assert.equal(Number(report.metrics?.patchPolicyViolations||0),0,'reviewed policy cannot be generated from calibration with patch-policy violations');

  const requiredInsufficient=Number(basePolicy.quality?.minimumInsufficientEvidenceAccuracy);
  assert.ok(Number(report.metrics?.insufficientEvidenceAccuracy)>=requiredInsufficient,'calibration does not satisfy the fixed insufficient-evidence floor');

  assert.ok(finite01(minimumAssessmentAccuracy),'--assessment must be a finite value in [0,1]');
  assert.ok(finite01(minimumRootCauseTop1Accuracy),'--root-cause must be a finite value in [0,1]');
  assert.ok(Number(minimumAssessmentAccuracy)<=Number(report.metrics?.assessmentAccuracy),'assessment threshold exceeds observed calibration accuracy');
  assert.ok(Number(minimumRootCauseTop1Accuracy)<=Number(report.metrics?.rootCauseTop1Accuracy),'root-cause threshold exceeds observed calibration accuracy');

  const observedMean=Number(report.review?.tokenDistribution?.meanTokensPerCase);
  assert.ok(Number.isFinite(observedMean)&&observedMean>0,'calibration report token mean is invalid');
  assert.ok(Number.isFinite(Number(maximumTokensPerCase))&&Number(maximumTokensPerCase)>0&&Number(maximumTokensPerCase)<=1000000,'--max-tokens must be finite and in (0,1000000]');
  assert.ok(Number(maximumTokensPerCase)>=observedMean,'token ceiling is below observed calibration mean');

  const candidate=copy(basePolicy);
  candidate.reviewed=true;
  candidate.calibrationEvidence=calibrationEvidenceFromReport(report);
  candidate.quality.minimumAssessmentAccuracy=Number(minimumAssessmentAccuracy);
  candidate.quality.minimumRootCauseTop1Accuracy=Number(minimumRootCauseTop1Accuracy);
  candidate.tokenEfficiency={calibrated:true,maximumTokensPerCase:Number(maximumTokensPerCase)};
  delete candidate.policyDigest;
  candidate.policyDigest=stableDigest(candidate);
  validateAdmissionPolicy(candidate);
  return Object.freeze(candidate);
}

function parseArgs(argv){
  const out={report:'',assessment:null,rootCause:null,maxTokens:null,output:'PROMOTION_ADMISSION_POLICY.candidate.json'};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--report')out.report=argv[++i];
    else if(arg==='--assessment')out.assessment=argv[++i];
    else if(arg==='--root-cause')out.rootCause=argv[++i];
    else if(arg==='--max-tokens')out.maxTokens=argv[++i];
    else if(arg==='--output')out.output=argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.report)throw new Error('--report is required');
  if(args.assessment===null)throw new Error('--assessment is required');
  if(args.rootCause===null)throw new Error('--root-cause is required');
  if(args.maxTokens===null)throw new Error('--max-tokens is required');
  const report=JSON.parse(fs.readFileSync(path.resolve(args.report),'utf8'));
  const root=path.resolve(__dirname,'..');
  const candidate=buildReviewedPolicy({report,minimumAssessmentAccuracy:Number(args.assessment),minimumRootCauseTop1Accuracy:Number(args.rootCause),maximumTokensPerCase:Number(args.maxTokens),expectedCoreCommit:currentCore(root)});
  fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(candidate,null,2)}\n`,'utf8');
  process.stdout.write(`${JSON.stringify({output:path.resolve(args.output),reviewed:true,calibrationReportDigest:candidate.calibrationEvidence.reportDigest,minimumAssessmentAccuracy:candidate.quality.minimumAssessmentAccuracy,minimumRootCauseTop1Accuracy:candidate.quality.minimumRootCauseTop1Accuracy,maximumTokensPerCase:candidate.tokenEfficiency.maximumTokensPerCase,policyDigest:candidate.policyDigest})}\n`);
}

if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={calibrationEvidenceFromReport,buildReviewedPolicy,parseArgs};
