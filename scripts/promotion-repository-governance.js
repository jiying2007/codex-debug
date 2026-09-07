#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {stableDigest}=require('./model-evaluation');

const SHA40=/^[0-9a-f]{40}$/;
const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function escapeRegex(value){return value.replace(/[.+^${}()|[\]\\]/g,'\\$&');}
function refPatternMatches(pattern,ref,defaultBranch){
  if(pattern==='~ALL')return true;
  if(pattern==='~DEFAULT_BRANCH')return ref===`refs/heads/${defaultBranch}`;
  const re=`^${escapeRegex(String(pattern)).replace(/\*/g,'.*').replace(/\?/g,'.')}$`;
  return new RegExp(re).test(ref);
}
function targetsBranch(ruleset,branch){
  if(ruleset?.target!=='branch'||ruleset?.enforcement!=='active')return false;
  const ref=`refs/heads/${branch}`,condition=ruleset.conditions?.ref_name||{},include=Array.isArray(condition.include)?condition.include:[],exclude=Array.isArray(condition.exclude)?condition.exclude:[];
  return include.some(x=>refPatternMatches(x,ref,branch))&&!exclude.some(x=>refPatternMatches(x,ref,branch));
}
function requiredCheckContexts(rule){
  return (rule?.parameters?.required_status_checks||[]).map(x=>String(x?.context||'')).filter(Boolean);
}
function evaluateGovernance({repository,branch='main',sourceSha,rulesets,requiredCheck='CI Gate',recordedAt=new Date().toISOString(),runContext={}}={}){
  assert.match(String(sourceSha||''),SHA40,'repository governance sourceSha must be a 40-hex commit');
  assert.ok(String(repository||'').includes('/'),'repository governance repository must be owner/name');
  assert.ok(String(branch||''),'repository governance branch is required');
  assert.ok(ISO_UTC.test(new Date(recordedAt).toISOString()),'repository governance recordedAt must be canonical UTC');
  const applicable=(rulesets||[]).filter(x=>targetsBranch(x,branch));
  const gaps=[];
  if(!applicable.length)gaps.push(`no active branch ruleset targets ${branch}`);
  const satisfying=[];
  for(const ruleset of applicable){
    const rules=Array.isArray(ruleset.rules)?ruleset.rules:[],byType=new Map(rules.map(x=>[x.type,x])),pull=byType.get('pull_request'),status=byType.get('required_status_checks');
    const checks=requiredCheckContexts(status),local=[];
    if(!pull)local.push('pull_request rule missing');
    else if(pull.parameters?.dismiss_stale_reviews_on_push!==true)local.push('pull_request dismiss_stale_reviews_on_push must be true');
    if(!status)local.push('required_status_checks rule missing');
    else{
      if(!checks.includes(requiredCheck))local.push(`required status check ${requiredCheck} missing`);
      if(status.parameters?.strict_required_status_checks_policy!==true)local.push('strict_required_status_checks_policy must be true');
    }
    if(!byType.has('non_fast_forward'))local.push('non_fast_forward rule missing');
    if(!byType.has('deletion'))local.push('deletion restriction rule missing');
    if(Array.isArray(ruleset.bypass_actors)&&ruleset.bypass_actors.length)local.push('ruleset bypass actors must be empty for promotion');
    if(!local.length)satisfying.push({id:ruleset.id,name:ruleset.name,enforcement:ruleset.enforcement,requiredChecks:checks.sort(),rulesetDigest:stableDigest(ruleset)});
  }
  if(applicable.length&&!satisfying.length)gaps.push(`no active ruleset fully enforces PR-only + strict ${requiredCheck} + no force-push + no deletion + no bypass`);
  const body={schemaVersion:1,kind:'codex-debug-promotion-repository-governance',recordedAt:new Date(recordedAt).toISOString(),repository,branch,sourceSha,requiredCheck,runContext:{...runContext},rulesets:satisfying.sort((a,b)=>String(a.id).localeCompare(String(b.id))),ready:gaps.length===0,gaps};
  body.digest=stableDigest(body);
  return Object.freeze(body);
}
function validateGovernanceReceipt(receipt,{expectedRepository='',expectedBranch='',expectedSourceSha=''}={}){
  assert.equal(receipt?.schemaVersion,1,'repository governance receipt schema mismatch');
  assert.equal(receipt?.kind,'codex-debug-promotion-repository-governance','repository governance receipt kind mismatch');
  assert.ok(ISO_UTC.test(String(receipt?.recordedAt||''))&&new Date(receipt.recordedAt).toISOString()===receipt.recordedAt,'repository governance recordedAt must be canonical UTC');
  assert.match(String(receipt?.sourceSha||''),SHA40,'repository governance sourceSha is invalid');
  assert.equal(receipt?.ready,true,'repository governance receipt is not ready');
  assert.deepEqual(receipt?.gaps,[],'repository governance receipt must have no gaps');
  assert.ok(Array.isArray(receipt?.rulesets)&&receipt.rulesets.length>0,'repository governance receipt requires a satisfying ruleset');
  if(expectedRepository)assert.equal(receipt.repository,expectedRepository,'repository governance repository mismatch');
  if(expectedBranch)assert.equal(receipt.branch,expectedBranch,'repository governance branch mismatch');
  if(expectedSourceSha)assert.equal(receipt.sourceSha,expectedSourceSha,'repository governance sourceSha mismatch');
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
function parseArgs(argv){const out={repository:'',branch:'main',sourceSha:'',requiredCheck:'CI Gate',output:'PROMOTION_REPOSITORY_GOVERNANCE.json',fixture:''};for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--repository')out.repository=argv[++i];else if(arg==='--branch')out.branch=argv[++i];else if(arg==='--source-sha')out.sourceSha=argv[++i];else if(arg==='--required-check')out.requiredCheck=argv[++i];else if(arg==='--output')out.output=argv[++i];else if(arg==='--fixture')out.fixture=argv[++i];else throw new Error(`Unknown argument: ${arg}`);}return out;}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.repository||!args.sourceSha)throw new Error('--repository and --source-sha are required');
  const rulesets=args.fixture?JSON.parse(fs.readFileSync(path.resolve(args.fixture),'utf8')):await fetchRulesets(args.repository,process.env.GITHUB_TOKEN||'');
  const runContext={workflow:process.env.GITHUB_WORKFLOW||'',runId:process.env.GITHUB_RUN_ID||'',runAttempt:process.env.GITHUB_RUN_ATTEMPT||'',event:process.env.GITHUB_EVENT_NAME||'',repository:process.env.GITHUB_REPOSITORY||args.repository,sourceSha:process.env.GITHUB_SHA||args.sourceSha};
  const receipt=evaluateGovernance({repository:args.repository,branch:args.branch,sourceSha:args.sourceSha,rulesets,requiredCheck:args.requiredCheck,runContext});
  fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(receipt,null,2)}\n`,'utf8');
  process.stdout.write(`${JSON.stringify({output:path.resolve(args.output),ready:receipt.ready,gaps:receipt.gaps,rulesets:receipt.rulesets.map(x=>x.name),digest:receipt.digest})}\n`);
  if(!receipt.ready)process.exitCode=2;
}
if(require.main===module){main().catch(error=>{console.error(error.stack||error.message);process.exitCode=2;});}
module.exports={refPatternMatches,targetsBranch,requiredCheckContexts,evaluateGovernance,validateGovernanceReceipt,fetchRulesets,parseArgs};
