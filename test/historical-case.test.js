'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {execFileSync}=require('node:child_process');
const {cleanCheckout,parseSubmoduleConfig}=require('../scripts/historical-case');

function git(cwd,args){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function initRepo(dir){
  fs.mkdirSync(dir,{recursive:true});
  git(dir,['init','-q']);
  git(dir,['config','user.name','Codex Debug Test']);
  git(dir,['config','user.email','codex-debug-test@example.invalid']);
}
function commitFile(repo,name,value,message){
  fs.writeFileSync(path.join(repo,name),value,'utf8');
  git(repo,['add',name]);
  git(repo,['commit','-q','-m',message]);
  return git(repo,['rev-parse','HEAD']);
}

test('submodule parser keeps explicit path and URL bindings',()=>{
  const rows=parseSubmoduleConfig('[submodule "src/codex-safe-core"]\n\tpath = src/codex-safe-core\n\turl = https://github.com/jiying2007/codex-safe-core.git\n');
  assert.deepEqual(rows,[{name:'src/codex-safe-core',path:'src/codex-safe-core',url:'https://github.com/jiying2007/codex-safe-core.git'}]);
});

test('historical checkout materializes the exact Core gitlink and switches pins',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-historical-core-test-'));
  try{
    const core=path.join(temp,'core'),parent=path.join(temp,'parent');
    initRepo(core);
    const coreA=commitFile(core,'marker.txt','core-a','core a');
    const coreB=commitFile(core,'marker.txt','core-b','core b');
    const coreUrl=pathToFileURL(core).href;

    initRepo(parent);
    fs.writeFileSync(path.join(parent,'.gitmodules'),`[submodule "src/codex-safe-core"]\n\tpath = src/codex-safe-core\n\turl = ${coreUrl}\n`,'utf8');
    git(parent,['add','.gitmodules']);
    git(parent,['update-index','--add','--cacheinfo',`160000,${coreA},src/codex-safe-core`]);
    git(parent,['commit','-q','-m','bad pin']);
    const bad=git(parent,['rev-parse','HEAD']);

    git(parent,['update-index','--cacheinfo',`160000,${coreB},src/codex-safe-core`]);
    git(parent,['commit','-q','-m','fixed pin']);
    const fixed=git(parent,['rev-parse','HEAD']);

    const options={trustedCoreUrl:coreUrl,allowedProtocols:'file'};
    assert.equal(cleanCheckout(parent,bad,process.env,options),bad);
    assert.equal(git(path.join(parent,'src','codex-safe-core'),['rev-parse','HEAD']),coreA);
    assert.equal(fs.readFileSync(path.join(parent,'src','codex-safe-core','marker.txt'),'utf8'),'core-a');

    assert.equal(cleanCheckout(parent,fixed,process.env,options),fixed);
    assert.equal(git(path.join(parent,'src','codex-safe-core'),['rev-parse','HEAD']),coreB);
    assert.equal(fs.readFileSync(path.join(parent,'src','codex-safe-core','marker.txt'),'utf8'),'core-b');

    assert.throws(
      ()=>cleanCheckout(parent,bad,process.env,{trustedCoreUrl:'https://github.com/jiying2007/codex-safe-core.git',allowedProtocols:'https'}),
      /reviewed trusted Core repository/
    );
  }finally{
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
