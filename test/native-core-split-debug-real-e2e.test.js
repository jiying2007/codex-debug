'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync,execFileSync}=require('node:child_process');
const {symbolizeCore}=require('../src/symbolizer');

function exists(command){return spawnSync(process.platform==='win32'?'where':'which',[command],{stdio:'ignore',windowsHide:true}).status===0;}

test('real stripped executable resolves core through exact GNU debuglink sidecar',{skip:process.platform!=='linux'},()=>{
  for(const tool of ['cc','gdb','objcopy','strip','readelf','nm'])assert.equal(exists(tool),true,'Linux split-debug core fixture requires '+tool);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-split-core-'));
  try{
    const source=path.join(dir,'split_debug.c'),full=path.join(dir,'split_debug.full'),exe=path.join(dir,'split_debug'),debug=path.join(dir,'split_debug.debug'),core=path.join(dir,'split-debug.core');
    fs.writeFileSync(source,'__attribute__((noinline)) int split_debug_crash(volatile int *p) { return *p + 31; }\nint main(void) { volatile int *p = (int*)0; return split_debug_crash(p); }\n','utf8');
    execFileSync('cc',['-g','-O2','-fno-omit-frame-pointer','-no-pie','-Wl,--build-id=sha1',source,'-o',full],{cwd:dir,stdio:['ignore','pipe','pipe']});
    execFileSync('objcopy',['--only-keep-debug',full,debug],{cwd:dir,stdio:['ignore','pipe','pipe']});
    fs.copyFileSync(full,exe);
    execFileSync('strip',['--strip-all',exe],{cwd:dir,stdio:['ignore','pipe','pipe']});
    execFileSync('objcopy',['--add-gnu-debuglink=split_debug.debug',exe],{cwd:dir,stdio:['ignore','pipe','pipe']});

    const sections=execFileSync('readelf',['-SW',exe],{encoding:'utf8'});
    assert.match(sections,/\.gnu_debuglink\b/,'stripped fixture has no GNU debuglink');
    assert.doesNotMatch(sections,/\.debug_info\b/,'stripped fixture still contains DWARF debug info');
    const nm=spawnSync('nm',[exe],{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']});
    assert.ok(nm.status!==0 || /no symbols/i.test(nm.stderr+nm.stdout),'stripped fixture unexpectedly retains normal symbol table');

    const generated=spawnSync('gdb',['-nx','-nh','-q','-batch','-ex','set auto-load off','-ex','set debuginfod enabled off','-ex','run','-ex',`generate-core-file ${core}`,exe],{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,windowsHide:true,env:{...process.env,DEBUGINFOD_URLS:'',GDBHISTFILE:'/dev/null'}});
    assert.equal(generated.error,undefined,generated.error?.message);
    assert.ok(fs.existsSync(core),`gdb did not create split-debug core: ${generated.stdout}\n${generated.stderr}`);

    const result=symbolizeCore({coreFile:core,executable:exe,tool:'gdb',cwd:dir,timeoutMs:30000,maxBytes:512*1024});
    assert.equal(result.tool,'gdb');
    assert.match(result.text,/split_debug_crash/);
    assert.match(result.text,/split_debug\.c/);
    assert.doesNotMatch(result.text,new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.equal(result.core.name,'split-debug.core');
    assert.equal(result.executable.name,'split_debug');
    assert.equal(result.truncated,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
