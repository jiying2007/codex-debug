#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const corpus=require('../quality/promotion-corpus.json');
const policy=require('../quality/promotion-admission-policy.json');
const governanceLock=require('../quality/promotion-repository-governance-lock.json');
const productContract=require('../product-contract.json');
const pkg=require('../package.json');
const {stableDigest}=require('./model-evaluation');
const {validatePromotionCorpus,promotionReadiness}=require('./promotion-corpus');
const {validateQualificationRecord}=require('./promotion-qualify');

const READINESS_VERSION=1;
function git(args,root){return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function currentHead(root){return git(['rev-parse','HEAD'],root);}
function currentCore(root){return git(['ls-files','--stage','src/codex-safe-core'],root).split(/\s+/)[1];}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function parseArgs(argv){const out={qualification:'',output:'PROMOTION_READINESS.json'};for(let i=0;i<argv.length;i++){if(argv[i]==='--qualification')out.qualification=argv[++i];else if(argv[i]==='--output')out.output=argv[++i];else throw new Error(`Unknown argument: ${argv[i]}`);}return out;}
function buildReadinessReceipt({root=path.resolve(__dirname,'..'),qualification=null,head=currentHead(root),core=currentCore(root),reviewedCorpus=corpus,admissionPolicy=policy,repositoryGovernanceLock=governanceLock,contract=productContract,packageManifest=pkg}={}){
  validatePromotionCorpus(reviewedCorpus);
  assert.equal(contract.productVersion,packageManifest.version,'product/package version mismatch');
  assert.equal(contract.safeCoreCommit,core,'Product Contract Safe Core pin differs from gitlink');
  const structural=promotionReadiness(reviewedCorpus),deterministicBlockers=[];
  if(!structural.ready)deterministicBlockers.push('promotion-corpus-structural-gaps');
  let qualificationState={present:false,valid:false,digest:null,debugCommit:null,coreCommit:null,runContext:null};
  if(!qualification){deterministicBlockers.push('qualification-missing');}
  else{
    validateQualificationRecord(qualification,reviewedCorpus);
    qualificationState={present:true,valid:true,digest:qualification.digest,debugCommit:qualification.debugCommit,coreCommit:qualification.coreCommit,runContext:qualification.runContext||null};
    if(qualification.debugCommit!==head)deterministicBlockers.push('qualification-not-bound-to-current-head');
    if(qualification.coreCommit!==core)deterministicBlockers.push('qualification-core-pin-mismatch');
  }
  const externalAuthorityBlockers=[];
  if(!admissionPolicy.calibrationEvidence)externalAuthorityBlockers.push('live-model-calibration-missing');
  if(admissionPolicy.reviewed!==true)externalAuthorityBlockers.push('admission-policy-unreviewed');
  if(admissionPolicy.tokenEfficiency?.calibrated!==true)externalAuthorityBlockers.push('token-policy-uncalibrated');
  if(repositoryGovernanceLock.reviewed!==true||!repositoryGovernanceLock.ruleset)externalAuthorityBlockers.push('governance-lock-unreviewed');
  if(reviewedCorpus.promotionEligible!==true)externalAuthorityBlockers.push('promotion-eligibility-unreviewed');
  if(contract.lifecycle!=='active')externalAuthorityBlockers.push('lifecycle-not-active');
  externalAuthorityBlockers.push('immutable-releases-platform-unverified');
  const receipt={schemaVersion:READINESS_VERSION,kind:'codex-debug-promotion-readiness',productVersion:contract.productVersion,lifecycle:contract.lifecycle,debugCommit:head,coreCommit:core,corpusDigest:stableDigest(reviewedCorpus),structural,qualification:qualificationState,admissionPolicy:{reviewed:admissionPolicy.reviewed===true,calibrationEvidence:admissionPolicy.calibrationEvidence||null,tokenCalibrated:admissionPolicy.tokenEfficiency?.calibrated===true,policyDigest:admissionPolicy.policyDigest},governanceLock:{reviewed:repositoryGovernanceLock.reviewed===true,rulesetPresent:Boolean(repositoryGovernanceLock.ruleset),lockDigest:repositoryGovernanceLock.lockDigest},promotionEligible:reviewedCorpus.promotionEligible===true,deterministicReady:deterministicBlockers.length===0,deterministicBlockers,externalAuthorityBlockers,readyForPromotionAuthorityReview:deterministicBlockers.length===0&&externalAuthorityBlockers.length>0,promotionAuthorized:deterministicBlockers.length===0&&externalAuthorityBlockers.length===0};
  receipt.receiptDigest=stableDigest(receipt);
  return Object.freeze(receipt);
}
function main(){const args=parseArgs(process.argv.slice(2)),qualification=args.qualification?readJson(path.resolve(args.qualification)):null,receipt=buildReadinessReceipt({qualification});fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(receipt,null,2)}\n`,'utf8');process.stdout.write(`${JSON.stringify({output:path.resolve(args.output),deterministicReady:receipt.deterministicReady,readyForPromotionAuthorityReview:receipt.readyForPromotionAuthorityReview,promotionAuthorized:receipt.promotionAuthorized,deterministicBlockers:receipt.deterministicBlockers,externalAuthorityBlockers:receipt.externalAuthorityBlockers,receiptDigest:receipt.receiptDigest})}\n`);}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={READINESS_VERSION,parseArgs,buildReadinessReceipt};
