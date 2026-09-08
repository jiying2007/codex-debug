'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync,execFileSync}=require('node:child_process');
const {symbolizeCore}=require('../src/symbolizer');

function exists(command){return spawnSync(process.platform==='win32'?'where':'which',[command],{stdio:'ignore',windowsHide:true}).status===0;}

test('real Linux core resolves crash inside a loaded shared library',{skip:process.platform!=='linux'},()=>{
  for(const tool of ['cc','gdb','readelf','nm'])assert.equal(exists(tool),true,'Linux shared-library core fixture requires '+tool);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-shared-core-'));
  try{
    const libSource=path.join(dir,'shared_crash.c'),mainSource=path.join(dir,'shared_main.c'),lib=path.join(dir,'libcrashfixture.so'),exe=path.join(dir,'shared_main'),core=path.join(dir,'shared-lib.core');
    fs.writeFileSync(libSource,'__attribute__((visibility("default"),noinline)) int shared_crash(volatile int *p) { return *p + 41; }\n','utf8');
    fs.writeFileSync(mainSource,'extern int shared_crash(volatile int *p);\nint main(void) { volatile int *p = (int*)0; return shared_crash(p); }\n','utf8');
    execFileSync('cc',['-g','-O2','-fno-omit-frame-pointer','-fPIC','-shared','-Wl,-soname,libcrashfixture.so','-Wl,--build-id=sha1',libSource,'-o',lib],{cwd:dir,stdio:['ignore','pipe','pipe']});
    execFileSync('cc',['-g','-O2','-fno-omit-frame-pointer','-fPIE','-pie',mainSource,'-L',dir,'-lcrashfixture','-Wl,-rpath,$ORIGIN','-Wl,--build-id=sha1','-o',exe],{cwd:dir,stdio:['ignore','pipe','pipe']});

    const dynamic=execFileSync('readelf',['-d',exe],{encoding:'utf8'});
    assert.match(dynamic,/NEEDED.*libcrashfixture\.so/,'fixture executable is not bound to the shared object');
    assert.match(dynamic,/(?:RUNPATH|RPATH).*\$ORIGIN/,'fixture executable has no origin-relative shared-library search path');
    const mainSymbols=execFileSync('nm',['-D',exe],{encoding:'utf8'});
    const libSymbols=execFileSync('nm',['-D',lib],{encoding:'utf8'});
    assert.match(mainSymbols,/\bU\s+shared_crash\b/,'main unexpectedly defines the crash function');
    assert.match(libSymbols,/\bT\s+shared_crash\b/,'shared object does not define the crash function');

    const generated=spawnSync('gdb',['-nx','-nh','-q','-batch','-ex','set auto-load off','-ex','set debuginfod enabled off','-ex','run','-ex',`generate-core-file ${core}`,exe],{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,windowsHide:true,env:{...process.env,DEBUGINFOD_URLS:'',GDBHISTFILE:'/dev/null'}});
    assert.equal(generated.error,undefined,generated.error?.message);
    assert.ok(fs.existsSync(core),`gdb did not create shared-library core: ${generated.stdout}\n${generated.stderr}`);

    const result=symbolizeCore({coreFile:core,executable:exe,tool:'gdb',cwd:dir,timeoutMs:30000,maxBytes:512*1024});
    assert.equal(result.tool,'gdb');
    assert.match(result.text,/shared_crash/);
    assert.match(result.text,/shared_crash\.c/);
    assert.match(result.text,/libcrashfixture\.so/);
    assert.doesNotMatch(result.text,new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.equal(result.core.name,'shared-lib.core');
    assert.equal(result.executable.name,'shared_main');
    assert.equal(result.truncated,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
