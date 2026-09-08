'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync,execFileSync}=require('node:child_process');
const {symbolizeCore}=require('../src/symbolizer');

function exists(command){const r=spawnSync(process.platform==='win32'?'where':'which',[command],{stdio:'ignore',windowsHide:true});return r.status===0;}
function symbolAddress(exe,name){const out=execFileSync('nm',['-n',exe],{encoding:'utf8'}),m=out.match(new RegExp('^([0-9a-fA-F]+)\\s+[Tt]\\s+'+name+'$','m'));assert.ok(m,'fixture executable has no '+name);return BigInt('0x'+m[1]);}

test('real optimized PIE core resolves rebased crash function and workspace source',{skip:process.platform!=='linux'},()=>{
  for(const tool of ['cc','gdb','nm','readelf'])assert.equal(exists(tool),true,'Linux optimized PIE core fixture requires '+tool);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-pie-core-'));
  try{
    const source=path.join(dir,'optimized_pie.c'),exe=path.join(dir,'optimized_pie'),core=path.join(dir,'optimized-pie.core');
    fs.writeFileSync(source,'__attribute__((noinline)) int optimized_pie_crash(volatile int *p) { return *p + 17; }\nint main(void) { volatile int *p = (int*)0; return optimized_pie_crash(p); }\n','utf8');
    execFileSync('cc',['-g','-O2','-fno-omit-frame-pointer','-fPIE','-pie','-Wl,--build-id=sha1',source,'-o',exe],{cwd:dir,stdio:['ignore','pipe','pipe']});
    const header=execFileSync('readelf',['-h',exe],{encoding:'utf8'});
    assert.match(header,/Type:\s+DYN\b/,'fixture executable is not PIE/ET_DYN');
    const linkAddress=symbolAddress(exe,'optimized_pie_crash');
    const generated=spawnSync('gdb',['-nx','-nh','-q','-batch','-ex','set auto-load off','-ex','set debuginfod enabled off','-ex','run','-ex','p/x (void*)optimized_pie_crash','-ex',`generate-core-file ${core}`,exe],{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,windowsHide:true,env:{...process.env,DEBUGINFOD_URLS:'',GDBHISTFILE:'/dev/null'}});
    assert.equal(generated.error,undefined,generated.error?.message);
    assert.ok(fs.existsSync(core),`gdb did not create optimized PIE core: ${generated.stdout}\n${generated.stderr}`);
    const runtime=(generated.stdout+'\n'+generated.stderr).match(/\$1\s*=\s*(?:\([^)]*\)\s*)?(0x[0-9a-fA-F]+)/);
    assert.ok(runtime,`gdb did not expose rebased optimized_pie_crash address: ${generated.stdout}\n${generated.stderr}`);
    const runtimeAddress=BigInt(runtime[1]);
    assert.notEqual(runtimeAddress,linkAddress,'PIE runtime address unexpectedly equals link-time symbol value');
    assert.ok(runtimeAddress>linkAddress,'PIE runtime address was not rebased above link-time symbol value');

    const result=symbolizeCore({coreFile:core,executable:exe,tool:'gdb',cwd:dir,timeoutMs:30000,maxBytes:512*1024});
    assert.equal(result.tool,'gdb');
    assert.match(result.text,/optimized_pie_crash/);
    assert.match(result.text,/optimized_pie\.c/);
    assert.doesNotMatch(result.text,new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.equal(result.core.name,'optimized-pie.core');
    assert.equal(result.executable.name,'optimized_pie');
    assert.equal(result.truncated,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
