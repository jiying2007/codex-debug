'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const vm=require('node:vm');const {createRequire}=require('node:module');
function extension(vscode){const filename=path.resolve(__dirname,'../extension.js'),mod={exports:{}},localRequire=createRequire(filename);vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:mod,exports:mod.exports,require:name=>name==='vscode'?vscode:localRequire(name)},{filename});return mod.exports;}
test('untrusted and ambiguous multi-root workspaces cannot choose an execution target',()=>{
 const vscode={workspace:{isTrusted:false,workspaceFolders:[{uri:{fsPath:'/first'}}]},window:{}};const actual=extension(vscode);
 assert.throws(()=>actual.workspace(),/untrusted/);vscode.workspace.isTrusted=true;vscode.workspace.workspaceFolders.push({uri:{fsPath:'/second'}});
 assert.throws(()=>actual.workspace(),/Select a file/);
});
test('active-root selection and last-result binding survive a workspace switch',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debug-ui-binding-'));
 try{
  const folders=['first','second'].map(name=>{const root=path.join(dir,name);fs.mkdirSync(root);return {uri:{fsPath:root}};});
  const output={show(){},appendLine(){},dispose(){}};
  const vscode={Uri:{file:fsPath=>({fsPath})},ProgressLocation:{Notification:1},commands:{registerCommand(){return {dispose(){}};}},workspace:{isTrusted:true,workspaceFolders:folders,getWorkspaceFolder(uri){return folders.find(f=>uri.fsPath.startsWith(f.uri.fsPath));},getConfiguration(){return {get(_key,fallback){return fallback;}};}},window:{activeTextEditor:{document:{uri:{fsPath:path.join(folders[1].uri.fsPath,'x.js')}}},createOutputChannel(){return output;},withProgress(_options,task){return task({},undefined);},showInformationMessage(){}}};
  const actual=extension(vscode);await actual.activate({subscriptions:[]});assert.equal(actual.workspace(),folders[1].uri.fsPath);
  const result=await actual.run({text:'fatal error: fixture',deterministicOnly:true,persist:false});assert.equal(actual.currentLastResult().sessionId,result.sessionId);
  vscode.window.activeTextEditor.document.uri.fsPath=path.join(folders[0].uri.fsPath,'x.js');assert.equal(actual.workspace(),folders[0].uri.fsPath);assert.equal(actual.currentLastResult(),null);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
