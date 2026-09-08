'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const {symbolizePlatform}=require('../src/platform-symbols');
const {buildDebugEvidence}=require('../src/evidence');
const {collectGitContext}=require('../src/git-context');

function exists(cmd){return spawnSync('sh',['-lc','command -v '+cmd],{stdio:'ignore'}).status===0;}
function buildId(elf){const out=execFileSync('readelf',['-n',elf],{encoding:'utf8'}),m=out.match(/Build ID:\s*([0-9a-f]+)/i);assert.ok(m,'fixture module has no GNU BuildId');return m[1].toLowerCase();}
function buildModule(root,name,constant){const dir=path.join(root,'src',name),source=path.join(dir,'module.c'),obj=path.join(root,name+'.o'),ko=path.join(root,name+'.ko');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(source,'__attribute__((noinline)) int module_fault(int x) { return (x + '+constant+') * '+(constant+1)+'; }\n','utf8');execFileSync('cc',['-g','-O0','-c',source,'-o',obj],{cwd:root,stdio:'pipe'});execFileSync('ld',['-r','--build-id=sha1',obj,'-o',ko],{cwd:root,stdio:'pipe'});return {source,ko,id:buildId(ko)};}

test('real multi-module collision keeps same symbol name bound to module identity and exact BuildId',{skip:process.platform!=='linux'},()=>{
  for(const tool of ['cc','ld','nm','readelf','addr2line'])assert.equal(exists(tool),true,'Linux multi-module fixture requires '+tool);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-kmod-multi-'));
  try{
    const alpha=buildModule(root,'alpha',3),beta=buildModule(root,'beta',7);
    assert.notEqual(alpha.id,beta.id,'independent module fixtures must have distinct BuildIds');
    execFileSync('git',['init','-q'],{cwd:root});
    execFileSync('git',['config','user.name','fixture'],{cwd:root});
    execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:root});
    execFileSync('git',['add','src'],{cwd:root});
    execFileSync('git',['commit','-qm','multi-module fixture sources'],{cwd:root});

    const oops='BUG: multi-module collision fixture\nCall Trace:\n'+
      ' [<ffffffffa1000010>] module_fault+0x0/0x40 [alpha-driver '+alpha.id+']\n'+
      ' [<ffffffffa2000010>] module_fault+0x0/0x40 [beta_driver '+beta.id+']\n\n';
    const specs=['alpha_driver='+alpha.ko,'beta-driver='+beta.ko];
    const symbols=symbolizePlatform({text:oops,kernelModuleSymbolSpecs:specs,cwd:root});
    const rows=symbols.kernelModules.resolutions;
    assert.equal(rows.length,2);
    assert.deepEqual(rows.map(row=>row.status),['resolved','resolved']);
    assert.equal(rows[0].module,'alpha-driver');
    assert.equal(rows[1].module,'beta_driver');
    assert.equal(rows[0].expectedBuildId,alpha.id);
    assert.equal(rows[0].actualBuildId,alpha.id);
    assert.equal(rows[1].expectedBuildId,beta.id);
    assert.equal(rows[1].actualBuildId,beta.id);
    assert.equal(rows[0].function,'module_fault');
    assert.equal(rows[1].function,'module_fault');
    assert.match(rows[0].location,/^src\/alpha\/module\.c:1/);
    assert.match(rows[1].location,/^src\/beta\/module\.c:1/);
    assert.notEqual(rows[0].symbolFile.fileDigest,rows[1].symbolFile.fileDigest);
    assert.equal(JSON.stringify(symbols).includes(alpha.ko),false,'alpha module absolute path leaked');
    assert.equal(JSON.stringify(symbols).includes(beta.ko),false,'beta module absolute path leaked');

    const evidence=buildDebugEvidence({text:oops,source:{type:'file',label:'multi-module-oops.log'},workspace:root,git:collectGitContext(root),platformSymbols:symbols});
    assert.equal(evidence.kind,'kernel');
    assert.ok(evidence.sourceContext.some(row=>row.file==='src/alpha/module.c'&&/module_fault/.test(row.text)),'alpha module source did not bind into source context');
    assert.ok(evidence.sourceContext.some(row=>row.file==='src/beta/module.c'&&/module_fault/.test(row.text)),'beta module source did not bind into source context');

    const swapped='BUG: swapped module identity fixture\nCall Trace:\n'+
      ' [<ffffffffa1000010>] module_fault+0x0/0x40 [alpha-driver '+beta.id+']\n'+
      ' [<ffffffffa2000010>] module_fault+0x0/0x40 [beta_driver '+alpha.id+']\n\n';
    const rejected=symbolizePlatform({text:swapped,kernelModuleSymbolSpecs:specs,cwd:root}).kernelModules.resolutions;
    assert.deepEqual(rejected.map(row=>row.status),['module-build-id-mismatch','module-build-id-mismatch']);
    assert.equal(rejected[0].actualBuildId,alpha.id);
    assert.equal(rejected[1].actualBuildId,beta.id);
    for(const row of rejected){assert.equal(row.function,undefined);assert.equal(row.location,undefined);}
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
