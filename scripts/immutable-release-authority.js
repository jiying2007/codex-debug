#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const corpus=require('../quality/promotion-corpus.json');
const currentPolicy=require('../quality/promotion-admission-policy.json');
const currentLock=require('../quality/promotion-repository-governance-lock.json');
const {stableDigest}=require('./model-evaluation');
const {validateAdmissionReceipt}=require('./validate-promotion-admission');
const {validateCalibrationReport}=require('./promotion-calibration-report');
const {validateGovernanceReceipt,GITHUB_ACTIONS_INTEGRATION_ID}=require('./promotion-repository-governance');

const RELEASE_AUTHORITY_VERSION=1;
const KIND='codex-debug-immutable-release-authority';
const PROMOTION_WORKFLOW='Promotion Model Evaluation';
const PROMOTION_WORKFLOW_PATH='.github/workflows/promotion-model-eval.yml';
const SHA40=/^[0-9a-f]{40}$/;
const EXPECTED_ACTIVATION_FILES=['ROADMAP.md','product-contract.json'];
const ROADMAP_PENDING='- [ ] Family promotion `development -> active` and immutable release workflow';
const ROADMAP_ACTIVE='- [x] Family promotion `development -> active` and immutable release workflow';

function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function currentHead(root){return git(root,['rev-parse','HEAD']);}
function currentCore(root){return git(root,['ls-files','--stage','src/codex-safe-core']).split(/\s+/)[1];}
function currentContract(root){return readJson(path.join(root,'product-contract.json'));}
function clone(value){return JSON.parse(JSON.stringify(value));}

function validateLifecycleTransition(parentContract,activeContract){
  assert.equal(parentContract?.lifecycle,'development','promotion parent must remain lifecycle=development');
  assert.equal(activeContract?.lifecycle,'active','release source must be lifecycle=active');
  const before=clone(parentContract),after=clone(activeContract);before.lifecycle='<lifecycle>';after.lifecycle='<lifecycle>';
  assert.deepEqual(after,before,'activation may only change Product Contract lifecycle');
  return true;
}

function validateRoadmapTransition(parentText,activeText){
  assert.ok(parentText.includes(ROADMAP_PENDING),'promotion parent roadmap must retain pending development -> active item');
  const expected=parentText.replace(ROADMAP_PENDING,ROADMAP_ACTIVE);
  assert.equal(activeText,expected,'activation may only mark the development -> active roadmap item complete');
  return true;
}

function validateActivationCommit(root,promotionSha,releaseSha=currentHead(root)){
  assert.match(String(promotionSha||''),SHA40,'promotion source SHA must be 40 hex');
  assert.match(String(releaseSha||''),SHA40,'release source SHA must be 40 hex');
  const parents=git(root,['show','-s','--format=%P',releaseSha]).split(/\s+/).filter(Boolean);
  assert.deepEqual(parents,[promotionSha],'active release commit must be the single direct child of the promotion source SHA');
  const changed=git(root,['diff','--name-only',promotionSha,releaseSha]).split(/\r?\n/).filter(Boolean).sort();
  assert.deepEqual(changed,EXPECTED_ACTIVATION_FILES,'activation commit may change only ROADMAP.md and product-contract.json');
  const parentContract=JSON.parse(git(root,['show',`${promotionSha}:product-contract.json`]));
  validateLifecycleTransition(parentContract,currentContract(root));
  const parentRoadmap=git(root,['show',`${promotionSha}:ROADMAP.md`])+'\n';
  const activeRoadmap=fs.readFileSync(path.join(root,'ROADMAP.md'),'utf8');
  validateRoadmapTransition(parentRoadmap,activeRoadmap);
  return {promotionSha,releaseSha,changedFiles:changed};
}

function validatePromotionRun(run,{repository,promotionRunId,promotionSha}){
  assert.equal(Number(run?.id),Number(promotionRunId),'promotion run id mismatch');
  assert.equal(run?.name,PROMOTION_WORKFLOW,'release requires Promotion Model Evaluation run');
  assert.equal(run?.path,PROMOTION_WORKFLOW_PATH,'promotion run workflow path mismatch');
  assert.equal(run?.event,'workflow_dispatch','promotion run must come from workflow_dispatch');
  assert.equal(run?.conclusion,'success','promotion run must be successful');
  assert.equal(run?.head_branch,'main','promotion run must target main');
  assert.equal(run?.head_sha,promotionSha,'promotion run head SHA mismatch');
  assert.ok(Number.isInteger(Number(run?.run_attempt))&&Number(run.run_attempt)>0,'promotion run attempt is invalid');
  if(run?.repository?.full_name)assert.equal(run.repository.full_name,repository,'promotion run repository mismatch');
  return run;
}

function expectedPromotionRunContext(run,repository,promotionSha){
  return {
    workflow:PROMOTION_WORKFLOW,
    runId:String(run.id),
    runAttempt:String(run.run_attempt),
    event:'workflow_dispatch',
    repository,
    sourceSha:promotionSha
  };
}

function validateArtifactRunContext(actual,expected,label){
  assert.ok(actual&&typeof actual==='object',`${label} runContext is required`);
  for(const key of ['workflow','runId','runAttempt','event','repository','sourceSha'])assert.equal(String(actual[key]??''),String(expected[key]),`${label} runContext mismatch: ${key}`);
  return actual;
}

function validateCiGate(checks,releaseSha){
  const runs=Array.isArray(checks?.check_runs)?checks.check_runs:[];
  const matching=runs.filter(item=>item?.name==='CI Gate'&&Number(item?.app?.id)===GITHUB_ACTIONS_INTEGRATION_ID);
  assert.equal(matching.length,1,'release source requires exactly one CI Gate from GitHub Actions');
  assert.equal(matching[0].head_sha,releaseSha,'CI Gate source SHA mismatch');
  assert.equal(matching[0].status,'completed','CI Gate must be completed');
  assert.equal(matching[0].conclusion,'success','CI Gate must be successful');
  return matching[0];
}

function promotionFiles(dir){
  const required=['PROMOTION_REPOSITORY_GOVERNANCE_LOCK.json','PROMOTION_REPOSITORY_GOVERNANCE.json','PROMOTION_CORPUS_QUALIFICATION.json','PROMOTION_MODEL_EVAL.json','PROMOTION_MODEL_EVAL_SUMMARY.json','PROMOTION_TRANSITIONS.json','PROMOTION_ADMISSION_POLICY.json','PROMOTION_ADMISSION.json','PROMOTION_CALIBRATION_REPORT.json'];
  for(const name of required)assert.ok(fs.existsSync(path.join(dir,name)),`promotion artifact missing ${name}`);
  return Object.fromEntries(required.map(name=>[name,readJson(path.join(dir,name))]));
}

function validatePromotionBundle(root,dir,promotionSha,runContext=null){
  const files=promotionFiles(dir),policy=files['PROMOTION_ADMISSION_POLICY.json'],qualification=files['PROMOTION_CORPUS_QUALIFICATION.json'],modelRecord=files['PROMOTION_MODEL_EVAL.json'],governanceLock=files['PROMOTION_REPOSITORY_GOVERNANCE_LOCK.json'],governanceReceipt=files['PROMOTION_REPOSITORY_GOVERNANCE.json'],admission=files['PROMOTION_ADMISSION.json'],report=files['PROMOTION_CALIBRATION_REPORT.json'];
  assert.equal(corpus.promotionEligible,true,'current reviewed promotion corpus is not promotionEligible');
  assert.equal(currentPolicy.reviewed,true,'current Promotion Admission Policy is not reviewed');
  assert.equal(currentLock.reviewed,true,'current Governance Lock is not reviewed');
  assert.equal(policy.policyDigest,currentPolicy.policyDigest,'promotion artifact policy differs from checked-in reviewed policy');
  assert.equal(governanceLock.lockDigest,currentLock.lockDigest,'promotion artifact Governance Lock differs from checked-in reviewed lock');
  if(runContext){
    validateArtifactRunContext(qualification.runContext,runContext,'qualification');
    validateArtifactRunContext(modelRecord.runContext,runContext,'model');
    validateArtifactRunContext(governanceReceipt.runContext,runContext,'governance');
    validateArtifactRunContext(admission.runContext,runContext,'admission');
    validateArtifactRunContext(report.runContext,runContext,'calibration report');
  }
  const core=currentCore(root);
  validateAdmissionReceipt({admission,policy:currentPolicy,reviewedCorpus:corpus,qualification,modelRecord,governanceLock:currentLock,governanceReceipt,expectedDebugCommit:promotionSha,expectedCoreCommit:core,requirePromotionEligible:true});
  validateCalibrationReport(report);
  assert.equal(report.debugCommit,promotionSha,'promotion report debugCommit mismatch');
  assert.equal(report.coreCommit,core,'promotion report Core mismatch');
  assert.equal(report.admissionDigest,admission.digest,'promotion report admission digest mismatch');
  assert.equal(report.governanceLockDigest,admission.governanceLockDigest,'promotion report Governance Lock digest mismatch');
  assert.equal(report.governanceReceiptDigest,admission.governanceReceiptDigest,'promotion report Governance Receipt digest mismatch');
  assert.equal(report.admission?.ready,true,'promotion report must bind a ready Admission v2');
  assert.ok(admission.governanceLockDigest&&admission.governanceReceiptDigest,'promotion Admission v2 must bind repository governance');
  return {admission,report,policy,governanceLock,governanceReceipt,core};
}

function buildReleaseAuthority({root=path.resolve(__dirname,'..'),promotionRun,promotionRunId,promotionDir,ciChecks,releaseGovernance,recordedAt=new Date().toISOString()}={}){
  const repository='jiying2007/codex-debug',releaseSha=currentHead(root),promotionSha=String(promotionRun?.head_sha||'');
  validatePromotionRun(promotionRun,{repository,promotionRunId,promotionSha});
  const runContext=expectedPromotionRunContext(promotionRun,repository,promotionSha);
  const activation=validateActivationCommit(root,promotionSha,releaseSha),gate=validateCiGate(ciChecks,releaseSha),bundle=validatePromotionBundle(root,promotionDir,promotionSha,runContext);
  validateGovernanceReceipt(releaseGovernance,{expectedRepository:repository,expectedBranch:'main',expectedSourceSha:releaseSha,expectedLockDigest:currentLock.lockDigest});
  const contract=currentContract(root);
  assert.equal(contract.lifecycle,'active','immutable release requires lifecycle=active');
  const body={schemaVersion:RELEASE_AUTHORITY_VERSION,kind:KIND,recordedAt:new Date(recordedAt).toISOString(),repository,version:contract.productVersion,releaseSha,promotionRunId:String(promotionRunId),promotionRunAttempt:runContext.runAttempt,promotionSha,activationFiles:activation.changedFiles,coreCommit:bundle.core,policyDigest:bundle.admission.policyDigest,promotionAdmissionDigest:bundle.admission.digest,governanceLockDigest:bundle.admission.governanceLockDigest,promotionGovernanceReceiptDigest:bundle.admission.governanceReceiptDigest,releaseGovernanceReceiptDigest:releaseGovernance.digest,ciGate:{name:'CI Gate',integrationId:GITHUB_ACTIONS_INTEGRATION_ID,checkRunId:gate.id,conclusion:gate.conclusion}};
  body.digest=stableDigest(body);
  return Object.freeze(body);
}

function parseArgs(argv){const out={promotionRun:'',promotionRunId:'',promotionDir:'',ciChecks:'',releaseGovernance:'',output:'RELEASE_AUTHORITY.json'};for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--promotion-run')out.promotionRun=argv[++i];else if(arg==='--promotion-run-id')out.promotionRunId=argv[++i];else if(arg==='--promotion-dir')out.promotionDir=argv[++i];else if(arg==='--ci-checks')out.ciChecks=argv[++i];else if(arg==='--release-governance')out.releaseGovernance=argv[++i];else if(arg==='--output')out.output=argv[++i];else throw new Error(`Unknown argument: ${arg}`);}return out;}
function main(){const args=parseArgs(process.argv.slice(2));for(const key of ['promotionRun','promotionRunId','promotionDir','ciChecks','releaseGovernance'])assert.ok(args[key],`--${key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())} is required`);const receipt=buildReleaseAuthority({promotionRun:readJson(args.promotionRun),promotionRunId:args.promotionRunId,promotionDir:path.resolve(args.promotionDir),ciChecks:readJson(args.ciChecks),releaseGovernance:readJson(args.releaseGovernance)});fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(receipt,null,2)}\n`,'utf8');process.stdout.write(`${JSON.stringify({valid:true,version:receipt.version,releaseSha:receipt.releaseSha,promotionSha:receipt.promotionSha,promotionAdmissionDigest:receipt.promotionAdmissionDigest,digest:receipt.digest})}\n`);}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={RELEASE_AUTHORITY_VERSION,KIND,PROMOTION_WORKFLOW,PROMOTION_WORKFLOW_PATH,EXPECTED_ACTIVATION_FILES,ROADMAP_PENDING,ROADMAP_ACTIVE,validateLifecycleTransition,validateRoadmapTransition,validateActivationCommit,validatePromotionRun,expectedPromotionRunContext,validateArtifactRunContext,validateCiGate,promotionFiles,validatePromotionBundle,buildReleaseAuthority,parseArgs};
