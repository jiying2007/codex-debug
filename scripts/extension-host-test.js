#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');const assert=require('node:assert/strict');
async function main(){
 const extensionDevelopmentPath=fs.realpathSync(process.argv[2]||''),version=process.argv[3]||'stable';
 const pkg=JSON.parse(fs.readFileSync(path.join(extensionDevelopmentPath,'package.json'),'utf8'));
 const product=JSON.parse(fs.readFileSync(path.join(extensionDevelopmentPath,'product-contract.json'),'utf8'));
 const vsixSha256=crypto.createHash('sha256').update(fs.readFileSync(process.argv[4])).digest('hex'),reportPath=path.resolve(process.argv[5]),results=[];
 assert.equal(pkg.name,'codex-debug-safe');assert.ok(fs.existsSync(path.join(extensionDevelopmentPath,'src','debug-worker.js')));
 assert.equal(fs.existsSync(path.join(extensionDevelopmentPath,'test')),false,'test must load the packaged extension, not the checkout');
 const dependency=process.env.CODEX_DEBUG_TEST_ELECTRON_MODULE||'@vscode/test-electron';const {downloadAndUnzipVSCode}=require(dependency);
 const executable=await downloadAndUnzipVSCode({version}),{createProcessRunner}=require(path.join(extensionDevelopmentPath,'src/codex-safe-core/process-runner')),runner=createProcessRunner((_zh,en)=>en);
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-extension-host-'));
 try{
  const folders=['first','second'].map(name=>{const folder=path.join(temporary,name);fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'fixture.txt'),'fatal error: fixture\n');return {path:folder};});
  const workspaceFile=path.join(temporary,'fixture.code-workspace');fs.writeFileSync(workspaceFile,JSON.stringify({folders}));
  for(const trust of ['trusted','untrusted']){
   const profile=path.join(temporary,`profile-${trust}`);fs.mkdirSync(path.join(profile,'User'),{recursive:true});
   fs.writeFileSync(path.join(profile,'User','settings.json'),JSON.stringify({'security.workspace.trust.enabled':true,'security.workspace.trust.startupPrompt':'never','workbench.startupEditor':'none','extensions.autoUpdate':false,'update.mode':'none'}));
   const caseReport=path.join(temporary,`result-${trust}.json`);
   // test-electron 3.1.0 runTests unconditionally disables Workspace Trust.
   // Launch its downloaded binary directly so the restricted case tests real trust.
   const args=[workspaceFile,'--no-sandbox','--disable-gpu','--disable-gpu-sandbox','--disable-updates','--no-cached-data',...(trust==='trusted'?['--disable-workspace-trust']:[]),'--disable-extensions','--skip-welcome','--skip-release-notes','--user-data-dir',profile,'--extensions-dir',path.join(temporary,`extensions-${trust}`),`--extensionDevelopmentPath=${extensionDevelopmentPath}`,`--extensionTestsPath=${path.resolve(__dirname,'../test/extension-host/index.js')}`];
   try{const output=await runner.runPreparedProcess(executable,args,{timeoutMs:180000,maxStdoutBytes:8*1024*1024,maxStderrBytes:8*1024*1024,env:{...process.env,CODEX_DEBUG_PACKAGED_ROOT:extensionDevelopmentPath,CODEX_DEBUG_TEST_TRUST:trust,CODEX_DEBUG_HOST_REPORT:caseReport}});process.stdout.write(output.stdout);process.stderr.write(output.stderr);}
   catch(error){process.stderr.write(`${error.stdoutTail||''}\n${error.stderrTail||''}\n`);throw error;}
   const result=JSON.parse(fs.readFileSync(caseReport,'utf8'));assert.equal(result.trust,trust);assert.equal(result.packagedExtension,true);results.push(result);
  }
  fs.writeFileSync(reportPath,`${JSON.stringify({schemaVersion:1,sourceSha:process.env.GITHUB_SHA||'',productVersion:pkg.version,coreCommit:product.safeCoreCommit,vsixSha256,requestedVersion:version,results},null,2)}\n`);
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
module.exports={main};
