#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
function walk(dir){if(!fs.existsSync(dir))return[];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{const p=path.join(dir,entry.name);return entry.isDirectory()?walk(p):[p];});}
function verifyImmutableReleaseWorkflow(file){
  const text=fs.readFileSync(file,'utf8'),rel=path.relative(root,file).replace(/\\/g,'/');
  assert.equal(path.basename(file),'immutable-release.yml',`unexpected release workflow name: ${rel}`);
  assert.match(text,/^name:\s*Immutable Release\s*$/m);
  assert.match(text,/\bon:\s*\n\s+workflow_dispatch:\s*\n/i);
  for(const forbidden of [/^\s*(?:push|pull_request|pull_request_target|schedule|repository_dispatch)\s*:/mi,/\bnpm\s+publish\b/i,/\bvsce\s+publish\b/i,/\bovsx\s+publish\b/i,/\bgit\s+push\b/i,/VSCE_PAT|OVSX_PAT|NPM_TOKEN/i])assert.doesNotMatch(text,forbidden,`immutable release workflow violates dormant release contract: ${rel}`);
  for(const required of ['promotion_run_id','acknowledge_immutable_release','Validate immutable release authority','immutable-release-authority.js','RELEASE_REPOSITORY_GOVERNANCE.json','GITHUB_IMMUTABLE_RELEASES.json','CI Gate','refs/heads/main','RELEASE_AUTHORITY.json','CODEX_DEBUG_RELEASE_ADMIN_READ_TOKEN','repos/${GITHUB_REPOSITORY}/immutable-releases','X-GitHub-Api-Version: 2026-03-10','actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8','gh release create','gh release verify','gh release verify-asset'])assert.ok(text.includes(required),`immutable release workflow missing ${required}`);
  assert.equal((text.match(/secrets\.CODEX_DEBUG_RELEASE_ADMIN_READ_TOKEN/g)||[]).length,2,'release admin-read secret must be scoped to exactly two immutable-release setting checks');
  assert.equal((text.match(/repos\/\$\{GITHUB_REPOSITORY\}\/immutable-releases/g)||[]).length,2,'platform immutable-release state must be checked in authority and immediately before publish');
  assert.match(text,/permissions:\s*\n\s+contents:\s*read\s*\n\s+actions:\s*read/i,'top-level immutable release permissions must remain read-only');
  assert.match(text,/publish:[\s\S]*?permissions:\s*\n\s+contents:\s*write\s*\n\s+actions:\s*read\s*\n\s+id-token:\s*write\s*\n\s+attestations:\s*write/i,'write permissions must be scoped only to publish job');
  const beforePublish=text.slice(0,text.indexOf('\n  publish:'));
  assert.doesNotMatch(beforePublish,/\bcontents:\s*write\b|\bid-token:\s*write\b|\battestations:\s*write\b/i,'authority/package jobs must remain read-only');
  return {manualOnly:true,authorityGated:true,platformImmutableReleaseRequired:true,publishWriteScoped:true};
}
function verifyDevelopmentBoundary(){
  const contract=JSON.parse(fs.readFileSync(path.join(root,'product-contract.json'),'utf8')),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.ok(['development','active'].includes(contract.lifecycle),'product lifecycle must be development or active');
  const workflows=walk(path.join(root,'.github','workflows')).filter(file=>/\.ya?ml$/i.test(file)),release=workflows.filter(file=>path.basename(file)==='immutable-release.yml');
  assert.equal(release.length,1,'repository must contain exactly one dormant immutable-release workflow');
  verifyImmutableReleaseWorkflow(release[0]);
  for(const file of workflows){
    if(file===release[0])continue;
    const rel=path.relative(root,file).replace(/\\/g,'/'),text=fs.readFileSync(file,'utf8');
    assert.doesNotMatch(path.basename(file),/(?:release|publish|marketplace)/i,`only immutable-release.yml may expose release authority: ${rel}`);
    for(const forbidden of [/\bpull_request_target\s*:/i,/\bcontents\s*:\s*write\b/i,/\bpackages\s*:\s*write\b/i,/\bid-token\s*:\s*write\b/i,/\bnpm\s+publish\b/i,/\bvsce\s+publish\b/i,/\bovsx\s+publish\b/i,/\bgh\s+release\b/i,/\bgit\s+push\b/i,/CODEX_DEBUG_RELEASE_ADMIN_READ_TOKEN/i])assert.doesNotMatch(text,forbidden,`non-release workflow contains publication/admin-read surface: ${rel}`);
  }
  const scripts=JSON.stringify(pkg.scripts||{});for(const forbidden of [/npm\s+publish/i,/vsce\s+publish/i,/ovsx\s+publish/i,/gh\s+release/i,/git\s+push/i])assert.doesNotMatch(scripts,forbidden,'package scripts cannot publish or push');
  return {lifecycle:contract.lifecycle,workflowCount:workflows.length,immutableReleaseWorkflow:true,platformImmutableReleaseRequired:true,publicationSurfaces:false,ordinaryPublicationSurfaces:false};
}
if(require.main===module){try{process.stdout.write(`${JSON.stringify(verifyDevelopmentBoundary())}\n`);}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={walk,verifyImmutableReleaseWorkflow,verifyDevelopmentBoundary};
