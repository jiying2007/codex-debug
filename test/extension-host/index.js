'use strict';
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');const vscode=require('vscode');
function record(result){const value={packagedExtension:true,vscode:vscode.version,node:process.versions.node,...result};fs.writeFileSync(process.env.CODEX_DEBUG_HOST_REPORT,`${JSON.stringify(value)}\n`);console.log(JSON.stringify(value));}
async function run(){
 if(process.env.CODEX_DEBUG_TEST_TRUST==='untrusted'){
  assert.equal(vscode.workspace.isTrusted,false,'isolated workspace must remain in Restricted Mode');
  const extension=vscode.extensions.getExtension('jiying2007.codex-debug-safe');assert.equal(Boolean(extension?.isActive),false,'unsupported extension must not activate automatically in Restricted Mode');
  const actual=require(path.join(process.env.CODEX_DEBUG_PACKAGED_ROOT,'extension.js'));assert.throws(()=>actual.workspace(),/untrusted/);
  record({trust:'untrusted',extensionActive:false,executionGuard:true});return;
 }
 const extension=vscode.extensions.getExtension('jiying2007.codex-debug-safe');assert.ok(extension,'packaged extension must be discovered');
 await extension.activate();assert.equal(extension.isActive,true);
 assert.equal(fs.realpathSync(extension.extensionPath),fs.realpathSync(process.env.CODEX_DEBUG_PACKAGED_ROOT));
 const pkg=extension.packageJSON,commands=await vscode.commands.getCommands(true);
 for(const item of pkg.contributes.commands)assert.ok(commands.includes(item.command),`missing command: ${item.command}`);
 assert.equal(pkg.capabilities.untrustedWorkspaces.supported,false);
 const actual=require(path.join(extension.extensionPath,'extension.js')),folders=vscode.workspace.workspaceFolders;
 assert.equal(folders.length,2);assert.equal(vscode.workspace.isTrusted,true);
 const second=await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folders[1].uri,'fixture.txt'));await vscode.window.showTextDocument(second);
 assert.equal(actual.workspace(),folders[1].uri.fsPath,'active workspace folder must be selected');
 const result=await actual.run({text:'fatal error: packaged deterministic fixture',deterministicOnly:true,persist:false});
 assert.equal(result.fixStatus,'diagnosed');assert.equal(result.receipt.kind,'codex-debug');assert.equal(actual.currentLastResult().sessionId,result.sessionId);
 const first=await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folders[0].uri,'fixture.txt'));await vscode.window.showTextDocument(first);
 assert.equal(actual.workspace(),folders[0].uri.fsPath);assert.equal(actual.currentLastResult(),null,'last result from another workspace must not be selected');
 await vscode.commands.executeCommand('safeCodexDebug.showOutput');
 record({trust:'trusted',commands:pkg.contributes.commands.length,workerExecution:true,multiRootBinding:true,productVersion:pkg.version});
}
module.exports={run};
