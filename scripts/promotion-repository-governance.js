#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {stableDigest}=require('./model-evaluation');

const GOVERNANCE_LOCK_VERSION=1;
const GOVERNANCE_RECEIPT_VERSION=2;
const GITHUB_ACTIONS_INTEGRATION_ID=15368;
const SHA40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LOCK_KIND='codex-debug-promotion-repository-governance-lock';

function escapeRegex(value){return String(value).replace(/[.+^${}()|[\]\\]/g,'\\$&');}
function refPatternMatches(pattern,ref,defaultBranch){
  if(pattern==='~ALL')return true;
  if(pattern==='~DEFAULT_BRANCH')return ref===`refs/heads/${defaultBranch}`;
  const re=`^${escapeRegex(pattern).replace(/\*/g,'.*').replace(/\?/g,'.')}$`;
  return new RegExp(re).test(ref);
}
function refConditions(ruleset){
  const condition=ruleset?.conditions?.ref_name||{};
  return {include:Array.isArray(condition.include)?condition.include:[],exclude:Array.isArray(condition.exclude)?condition.exclude:[]};
}
function usesDynamicDefaultBranch(ruleset){
  const {include,exclude}=refConditions(ruleset);
  return [...include,...exclude].includes('~DEFAULT_BRANCH');
}
function targetsBranch(ruleset,branch){
  if(ruleset?.target!=='branch'||ruleset?.enforcement!=='active'||usesDynamicDefaultBranch(ruleset))return false;
  const ref=`refs/heads/${branch}`,{include,exclude}=refConditions(ruleset);
  return include.some(x=>refPatternMatches(x,ref,''))&&!exclude.some(x=>refPatternMatches(x,ref,''));
}
function requiredCheckEntries(rule){return Array.isArray(rule?.parameters?.required_status_checks)?rule.parameters.required_status_checks:[];}
function requiredCheckContexts(rule){return requiredCheckEntries(rule).map(x=>String(x?.context||'')).filter(Boolean);}
function publicRulesetProjection(ruleset){
  return {
    id:ruleset?.id??null,
    name:String(ruleset?.name||''),
    target:String(ruleset?.target||''),
    source_type:String(ruleset?.source_type||''),
    source:String(ruleset?.source||''),
    enforcement:String(ruleset?.enforcement||''),
    created_at:String(ruleset?.created_at||''),
    updated_at:String(ruleset?.updated_at||''),
    conditions:ruleset?.conditions||{},
    rules:Array.isArray(ruleset?.rules)?ruleset.rules:[]
  };
}
function ruleGaps(ruleset,branch,requiredCheck,{requireBypassVisibility=false}={}){
  const gaps=[];
  if(usesDynamicDefaultBranch(ruleset))gaps.push('ruleset must not use ~DEFAULT_BRANCH; promotion governance requires stable explicit main targeting');
  if(!targetsBranch(ruleset,branch))gaps.push(`ruleset must be active and target ${branch}`);
  const rules=Array.isArray(ruleset?.rules)?ruleset.rules:[],byType=new Map(rules.map(x=>[x.type,x])),pull=byType.get('pull_request'),status=byType.get('required_status_checks');
  const checks=requiredCheckContexts(status);
  if(!pull)gaps.push('pull_request rule missing');
  else if(pull.parameters?.dismiss_stale_reviews_on_push!==true)gaps.push('pull_request dismiss_stale_reviews_on_push must be true');
  if(!status)gaps.push('required_status_checks rule missing');
  else{
    const matching=requiredCheckEntries(status).filter(entry=>String(entry?.context||'')===requiredCheck);
    if(!matching.length)gaps.push(`required status check ${requiredCheck} missing`);
    else if(matching.length!==1)gaps.push(`required status check ${requiredCheck} must appear exactly once`);
    else if(Number(matching[0]?.integration_id)!==GITHUB_ACTIONS_INTEGRATION_ID)gaps.push(`required status check ${requiredCheck} must require GitHub Actions integration ${GITHUB_ACTIONS_INTEGRATION_ID}`);
    if(status.parameters?.strict_required_status_checks_policy!==true)gaps.push('strict_required_status_checks_policy must be true');
  }
  if(!byType.has('non_fast_forward'))gaps.push('non_fast_forward rule missing');
  if(!byType.has('deletion'))gaps.push('deletion restriction rule missing');
  const hasBypass=Object.prototype.hasOwnProperty.call(ruleset||{},'bypass_actors');
  if(requireBypassVisibility&&!hasBypass)gaps.push('admin snapshot must expose bypass_actors');
  if(hasBypass&&!Array.isArray(ruleset.bypass_actors))gaps.push('bypass_actors must be an array');
  if(Array.isArray(ruleset?.bypass_actors)&&ruleset.bypass_actors.length)gaps.push('ruleset bypass actors must be empty for promotion');
  return {gaps,checks:checks.sort()};
}
function validateGovernanceLock(lock,{expectedRepository='',expectedBranch='',expectedRequiredCheck='',requireReviewed=true}={}){
  assert.equal(lock?.schemaVersion,GOVERNANCE_LOCK_VERSION,'repository governance lock schema mismatch');
  assert.equal(lock?.kind,LOCK_KIND,'repository governance lock kind mismatch');
  assert.ok(String(lock?.repository||'').includes('/'),'repository governance lock repository must be owner/name');
  assert.ok(String(lock?.branch||''),'repository governance lock branch is required');
  assert.ok(String(lock?.requiredCheck||''),'repository governance lock requiredCheck is required');
  if(expectedRepository)assert.equal(lock.repository,expectedRepository,'repository governance lock repository mismatch');
  if(expectedBranch)assert.equal(lock.branch,expectedBranch,'repository governance lock branch mismatch');
  if(expectedRequiredCheck)assert.equal(lock.requiredCheck,expectedRequiredCheck,'repository governance lock requiredCheck mismatch');
  const copy={...lock};delete copy.lockDigest;assert.match(String(lock?.lockDigest||''),HEX64,'repository governance lock digest is invalid');assert.equal(lock.lockDigest,stableDigest(copy),'repository governance lock self digest mismatch');
  if(requireReviewed)assert.equal(lock.reviewed,true,'repository governance lock is not reviewed');
  if(lock.reviewed){
    assert.ok(ISO_UTC.test(String(lock.reviewedAt||''))&&new Date(lock.reviewedAt).toISOString()===lock.reviewedAt,'repository governance lock reviewedAt must be canonical UTC');
    assert.ok(lock.ruleset&&typeof lock.ruleset==='object','repository governance lock requires a ruleset');
    assert.ok(Number.isInteger(lock.ruleset.id)&&lock.ruleset.id>0,'repository governance lock ruleset id is invalid');
    assert.ok(String(lock.ruleset.name||''),'repository governance lock ruleset name is required');
    assert.ok(!Number.isNaN(Date.parse(String(lock.ruleset.updatedAt||''))),'repository governance lock ruleset updatedAt is invalid');
    assert.match(String(lock.ruleset.publicProjectionDigest||''),HEX64,'repository governance lock public projection digest is invalid');
    assert.match(String(lock.ruleset.adminSnapshotDigest||''),HEX64,'repository governance lock admin snapshot digest is invalid');
    assert.equal(lock.ruleset.bypassActorCount,0,'repository governance lock requires zero bypass actors');
  }else assert.equal(lock.ruleset,null,'draft repository governance lock must not bind a ruleset');
  return lock;
}
function createGovernanceLock({repository,branch='main',requiredCheck='CI Gate',ruleset,reviewedAt=new Date().toISOString()}={}){
  assert.ok(String(repository||'').includes('/'),'repository governance lock repository must be owner/name');
  assert.ok(ISO_UTC.test(new Date(reviewedAt).toISOString()),'repository governance lock reviewedAt must be canonical UTC');
  const {gaps}=ruleGaps(ruleset,branch,requiredCheck,{requireBypassVisibility:true});
  assert.deepEqual(gaps,[],`repository governance admin snapshot is not acceptable: ${gaps.join('; ')}`);
  assert.ok(Number.isInteger(ruleset?.id)&&ruleset.id>0,'repository governance ruleset id is invalid');
  assert.ok(!Number.isNaN(Date.parse(String(ruleset?.updated_at||''))),'repository governance ruleset updated_at is required');
  const body={schemaVersion:GOVERNANCE_LOCK_VERSION,kind:LOCK_KIND,reviewed:true,reviewedAt:new Date(reviewedAt).toISOString(),repository,branch,requiredCheck,ruleset:{id:ruleset.id,name:String(ruleset.name||''),updatedAt:String(ruleset.updated_at),publicProjectionDigest:stableDigest(publicRulesetProjection(ruleset)),adminSnapshotDigest:stableDigest(ruleset),bypassActorCount:0}};
  body.lockDigest=stableDigest(body);
  return Object.freeze(body);
}
function evaluateGovernance({repository,branch='main',sourceSha,rulesets,lock,requiredCheck='CI Gate',recordedAt=new Date().toISOString(),runContext={}}={}){
  assert.match(String(sourceSha||''),SHA40,'repository governance sourceSha must be a 40-hex commit');
  assert.ok(String(repository||'').includes('/'),'repository governance repository must be owner/name');
  assert.ok(ISO_UTC.test(new Date(recordedAt).toISOString()),'repository governance recordedAt must be canonical UTC');
  validateGovernanceLock(lock,{expectedRepository:repository,expectedBranch:branch,expectedRequiredCheck:requiredCheck,requireReviewed:true});
  const gaps=[],satisfying=[],matched=(rulesets||[]).filter(x=>String(x?.id)===String(lock.ruleset.id));
  if(!matched.length)gaps.push(`reviewed ruleset ${lock.ruleset.id} is not present in live repository rulesets`);
  for(const ruleset of matched){
    const local=ruleGaps(ruleset,branch,requiredCheck).gaps;
    if(String(ruleset.updated_at||'')!==lock.ruleset.updatedAt)local.push('ruleset updated_at differs from reviewed governance lock');
    const projectionDigest=stableDigest(publicRulesetProjection(ruleset));
    if(projectionDigest!==lock.ruleset.publicProjectionDigest)local.push('ruleset public projection differs from reviewed governance lock');
    if(!local.length)satisfying.push({id:ruleset.id,name:ruleset.name,enforcement:ruleset.enforcement,updatedAt:String(ruleset.updated_at||''),requiredChecks:requiredCheckContexts((ruleset.rules||[]).find(x=>x.type==='required_status_checks')).sort(),publicProjectionDigest:projectionDigest,governanceLockDigest:lock.lockDigest});
    else gaps.push(...local);
  }
  const body={schemaVersion:GOVERNANCE_RECEIPT_VERSION,kind:'codex-debug-promotion-repository-governance',recordedAt:new Date(recordedAt).toISOString(),repository,branch,sourceSha,requiredCheck,governanceLockDigest:lock.lockDigest,runContext:{...runContext},rulesets:satisfying,ready:gaps.length===0&&satisfying.length===1,gaps:[...new Set(gaps)]};
  body.digest=stableDigest(body);
  return Object.freeze(body);
}
function validateGovernanceReceipt(receipt,{expectedRepository='',expectedBranch='',expectedSourceSha='',expectedLockDigest=''}={}){
  assert.equal(receipt?.schemaVersion,GOVERNANCE_RECEIPT_VERSION,'repository governance receipt schema mismatch');
  assert.equal(receipt?.kind,'codex-debug-promotion-repository-governance','repository governance receipt kind mismatch');
  assert.ok(ISO_UTC.test(String(receipt?.recordedAt||''))&&new Date(receipt.recordedAt).toISOString()===receipt.recordedAt,'repository governance recordedAt must be canonical UTC');
  assert.match(String(receipt?.sourceSha||''),SHA40,'repository governance sourceSha is invalid');
  assert.match(String(receipt?.governanceLockDigest||''),HEX64,'repository governance lock digest is invalid');
  assert.equal(receipt?.ready,true,'repository governance receipt is not ready');
  assert.deepEqual(receipt?.gaps,[],'repository governance receipt must have no gaps');
  assert.ok(Array.isArray(receipt?.rulesets)&&receipt.rulesets.length===1,'repository governance receipt requires exactly one reviewed ruleset');
  if(expectedRepository)assert.equal(receipt.repository,expectedRepository,'repository governance repository mismatch');
  if(expectedBranch)assert.equal(receipt.branch,expectedBranch,'repository governance branch mismatch');
  if(expectedSourceSha)assert.equal(receipt.sourceSha,expectedSourceSha,'repository governance sourceSha mismatch');
  if(expectedLockDigest)assert.equal(receipt.governanceLockDigest,expectedLockDigest,'repository governance lock digest mismatch');
  const copy={...receipt};delete copy.digest;assert.equal(receipt.digest,stableDigest(copy),'repository governance receipt self digest mismatch');
  return receipt;
}
async function fetchJson(url,token=''){
  const headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'codex-debug-promotion-governance'};
  if(token)headers.Authorization=`Bearer ${token}`;
  const response=await fetch(url,{headers,redirect:'error'});
  if(!response.ok)throw new Error(`GitHub governance API ${response.status}: ${url}`);
  return response.json();
}
async function fetchRulesets(repository,token=''){
  const base=`https://api.github.com/repos/${repository}`,summaries=await fetchJson(`${base}/rulesets?per_page=100`,token),details=[];
  for(const item of summaries){if(item?.target==='branch'&&item?.enforcement==='active')details.push(await fetchJson(`${base}/rulesets/${item.id}`,token));}
  return details;
}
function parseArgs(argv){const out={repository:'',branch:'main',sourceSha:'',requiredCheck:'CI Gate',lock:'',output:'PROMOTION_REPOSITORY_GOVERNANCE.json',fixture:''};for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--repository')out.repository=argv[++i];else if(arg==='--branch')out.branch=argv[++i];else if(arg==='--source-sha')out.sourceSha=argv[++i];else if(arg==='--required-check')out.requiredCheck=argv[++i];else if(arg==='--lock')out.lock=argv[++i];else if(arg==='--output')out.output=argv[++i];else if(arg==='--fixture')out.fixture=argv[++i];else throw new Error(`Unknown argument: ${arg}`);}return out;}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.repository||!args.sourceSha||!args.lock)throw new Error('--repository, --source-sha and --lock are required');
  const lock=JSON.parse(fs.readFileSync(path.resolve(args.lock),'utf8'));
  const rulesets=args.fixture?JSON.parse(fs.readFileSync(path.resolve(args.fixture),'utf8')):await fetchRulesets(args.repository,process.env.GITHUB_TOKEN||'');
  const runContext={workflow:process.env.GITHUB_WORKFLOW||'',runId:process.env.GITHUB_RUN_ID||'',runAttempt:process.env.GITHUB_RUN_ATTEMPT||'',event:process.env.GITHUB_EVENT_NAME||'',repository:process.env.GITHUB_REPOSITORY||args.repository,sourceSha:process.env.GITHUB_SHA||args.sourceSha};
  const receipt=evaluateGovernance({repository:args.repository,branch:args.branch,sourceSha:args.sourceSha,rulesets,lock,requiredCheck:args.requiredCheck,runContext});
  fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(receipt,null,2)}\n`,'utf8');
  process.stdout.write(`${JSON.stringify({output:path.resolve(args.output),ready:receipt.ready,gaps:receipt.gaps,rulesets:receipt.rulesets.map(x=>x.name),lockDigest:receipt.governanceLockDigest,digest:receipt.digest})}\n`);
  if(!receipt.ready)process.exitCode=2;
}
if(require.main===module){main().catch(error=>{console.error(error.stack||error.message);process.exitCode=2;});}
module.exports={GOVERNANCE_LOCK_VERSION,GOVERNANCE_RECEIPT_VERSION,GITHUB_ACTIONS_INTEGRATION_ID,LOCK_KIND,refPatternMatches,refConditions,usesDynamicDefaultBranch,targetsBranch,requiredCheckEntries,requiredCheckContexts,publicRulesetProjection,ruleGaps,validateGovernanceLock,createGovernanceLock,evaluateGovernance,validateGovernanceReceipt,fetchRulesets,parseArgs};
