#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {createGovernanceLock}=require('./promotion-repository-governance');

function parseArgs(argv){
  const out={repository:'',branch:'main',requiredCheck:'CI Gate',adminSnapshot:'',output:'PROMOTION_REPOSITORY_GOVERNANCE_LOCK.candidate.json'};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--repository')out.repository=argv[++i];
    else if(arg==='--branch')out.branch=argv[++i];
    else if(arg==='--required-check')out.requiredCheck=argv[++i];
    else if(arg==='--admin-snapshot')out.adminSnapshot=argv[++i];
    else if(arg==='--output')out.output=argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}
function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.repository||!args.adminSnapshot)throw new Error('--repository and --admin-snapshot are required');
  const snapshot=JSON.parse(fs.readFileSync(path.resolve(args.adminSnapshot),'utf8'));
  const lock=createGovernanceLock({repository:args.repository,branch:args.branch,requiredCheck:args.requiredCheck,ruleset:snapshot});
  fs.writeFileSync(path.resolve(args.output),`${JSON.stringify(lock,null,2)}\n`,'utf8');
  process.stdout.write(`${JSON.stringify({output:path.resolve(args.output),rulesetId:lock.ruleset.id,rulesetName:lock.ruleset.name,updatedAt:lock.ruleset.updatedAt,lockDigest:lock.lockDigest})}\n`);
}
if(require.main===module){try{main();}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={parseArgs};
