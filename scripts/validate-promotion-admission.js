#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const corpus=require('../quality/promotion-corpus.json');
const defaultPolicy=require('../quality/promotion-admission-policy.json');
const {stableDigest}=require('./model-evaluation');
const {validatePromotionCorpus}=require('./promotion-corpus');
const {validateQualificationRecord}=require('./promotion-qualify');
const {ADMISSION_VERSION,validateAdmissionPolicy,evaluateAdmission}=require('./promotion-admission');

const SHA40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function currentHead(root){return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function currentCore(root){return execFileSync('git',['ls-files','--stage','src/codex-safe-core'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split(/\s+/)[1];}
function payload(record){const copy={...record};delete copy.digest;return copy;}

function validateAdmissionReceipt({admission,policy=defaultPolicy,reviewedCorpus=corpus,qualification,modelRecord,governanceLock=null,governanceReceipt=null,expectedDebugCommit='',expectedCoreCommit='',requirePromotionEligible=false}={}){
  validatePromotionCorpus(reviewedCorpus);validateAdmissionPolicy(policy);validateQualificationRecord(qualification,reviewedCorpus);
  assert.equal(admission?.schemaVersion,ADMISSION_VERSION,'promotion admission receipt schema mismatch');
  assert.equal(admission?.kind,'codex-debug-promotion-admission','promotion admission receipt kind mismatch');
  assert.match(String(admission?.recordedAt||''),ISO_UTC,'promotion admission recordedAt must be canonical UTC');
  assert.equal(new Date(admission.recordedAt).toISOString(),admission.recordedAt,'promotion admission recordedAt must round-trip canonically');
  assert.match(String(admission?.debugCommit||''),SHA40,'invalid promotion admission debugCommit');assert.match(String(admission?.coreCommit||''),SHA40,'invalid promotion admission coreCommit');
  for(const key of ['corpusDigest','evaluationCorpusDigest','policyDigest','qualificationDigest','modelRecordDigest','digest'])assert.match(String(admission?.[key]||''),HEX64,`invalid promotion admission ${key}`);
  for(const key of ['governanceLockDigest','governanceReceiptDigest'])assert.ok(admission?.[key]===null||HEX64.test(String(admission[key])),`invalid promotion admission ${key}`);
  assert.equal(admission.digest,stableDigest(payload(admission)),'promotion admission self digest mismatch');

  const expected=evaluateAdmission({policy,reviewedCorpus,qualification,modelRecord,governanceLock,governanceReceipt,expectedDebugCommit,expectedCoreCommit,requirePromotionEligible,recordedAt:admission.recordedAt});
  assert.equal(admission.digest,expected.digest,'promotion admission receipt does not match bound policy/qualification/model/governance evidence');
  if(requirePromotionEligible)assert.equal(admission.ready,true,'promotion admission receipt is not ready');
  return admission;
}

function parseArgs(argv){const out={policy:'quality/promotion-admission-policy.json',qualification:'',record:'',governanceLock:'',governance:'',admission:'',requirePromotionEligible:false};for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--policy')out.policy=argv[++i];else if(arg==='--qualification')out.qualification=argv[++i];else if(arg==='--record')out.record=argv[++i];else if(arg==='--governance-lock')out.governanceLock=argv[++i];else if(arg==='--governance')out.governance=argv[++i];else if(arg==='--admission')out.admission=argv[++i];else if(arg==='--require-promotion-eligible')out.requirePromotionEligible=true;else throw new Error(`Unknown argument: ${arg}`);}return out;}

function main(){
  const args=parseArgs(process.argv.slice(2));if(!args.qualification||!args.record||!args.admission)throw new Error('--qualification, --record and --admission are required');
  const read=file=>file?JSON.parse(fs.readFileSync(path.resolve(file),'utf8')):null,policy=read(args.policy),qualification=read(args.qualification),modelRecord=read(args.record),governanceLock=read(args.governanceLock),governanceReceipt=read(args.governance),admission=read(args.admission),root=path.resolve(__dirname,'..');
  validateAdmissionReceipt({policy,reviewedCorpus:corpus,qualification,modelRecord,governanceLock,governanceReceipt,admission,expectedDebugCommit:currentHead(root),expectedCoreCommit:currentCore(root),requirePromotionEligible:args.requirePromotionEligible});
  process.stdout.write(`${JSON.stringify({valid:true,ready:admission.ready,digest:admission.digest,policyDigest:admission.policyDigest,qualificationDigest:admission.qualificationDigest,modelRecordDigest:admission.modelRecordDigest,governanceLockDigest:admission.governanceLockDigest,governanceReceiptDigest:admission.governanceReceiptDigest})}\n`);
}

if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={validateAdmissionReceipt};
