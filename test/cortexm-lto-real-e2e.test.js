'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const {symbolizeEmbedded}=require('../src/embedded-symbols');
const {buildDebugEvidence}=require('../src/evidence');
const {collectGitContext}=require('../src/git-context');

function exists(cmd){return spawnSync('sh',['-lc',`command -v ${cmd}`],{stdio:'ignore'}).status===0;}
function regexEscape(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

test('real optimized GNU Arm LTO fixture preserves Cortex-M fault source identity',{skip:process.platform!=='linux'},()=>{
  for(const tool of ['arm-none-eabi-gcc','arm-none-eabi-nm','arm-none-eabi-readelf','arm-none-eabi-addr2line']){
    assert.equal(exists(tool),true,`Linux Cortex-M LTO fixture requires ${tool}`);
  }
  const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'codex-cm-lto-work-'));
  const build=fs.mkdtempSync(path.join(os.tmpdir(),'codex-cm-lto-build-'));
  try{
    fs.mkdirSync(path.join(workspace,'src'),{recursive:true});
    const source=[
      '__attribute__((used,noinline,externally_visible))',
      'void fault_handler(void) {',
      '  __asm volatile("bkpt #0");',
      '  for (;;) { __asm volatile("" ::: "memory"); }',
      '}',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(workspace,'src','fault.c'),source,'utf8');
    execFileSync('git',['init','-q'],{cwd:workspace});
    execFileSync('git',['config','user.name','fixture'],{cwd:workspace});
    execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:workspace});
    execFileSync('git',['add','src/fault.c'],{cwd:workspace});
    execFileSync('git',['commit','-qm','optimized lto fixture source'],{cwd:workspace});

    fs.mkdirSync(path.join(build,'src'),{recursive:true});
    const externalSource=path.join(build,'src','fault.c');
    fs.writeFileSync(externalSource,source,'utf8');
    const obj=path.join(build,'fault.o');
    const elf=path.join(build,'firmware.elf');
    const map=path.join(build,'firmware.map');
    const linker=path.join(build,'link.ld');
    fs.writeFileSync(linker,[
      'ENTRY(fault_handler)',
      'SECTIONS {',
      '  . = 0x08000000;',
      '  .text : { KEEP(*(.text*)) }',
      '  .rodata : { *(.rodata*) }',
      '  .data : { *(.data*) }',
      '  .bss : { *(.bss*) *(COMMON) }',
      '}',
      ''
    ].join('\n'),'utf8');

    const common=['-mcpu=cortex-m3','-mthumb','-g3','-O2','-flto','-ffreestanding','-fno-builtin','-ffunction-sections','-fdata-sections'];
    execFileSync('arm-none-eabi-gcc',[...common,`-fdebug-prefix-map=${build}=${workspace}`,'-c',externalSource,'-o',obj],{cwd:build,stdio:'pipe'});
    const objectSections=execFileSync('arm-none-eabi-readelf',['-SW',obj],{cwd:build,encoding:'utf8'});
    assert.match(objectSections,/\.gnu\.lto_/,'fixture object does not contain GCC LTO IR sections');

    execFileSync('arm-none-eabi-gcc',[...common,'-nostdlib',`-Wl,-T,${linker}`,`-Wl,-Map,${map}`,'-Wl,--gc-sections','-Wl,-e,fault_handler','-o',elf,obj],{cwd:build,stdio:'pipe'});
    const nm=execFileSync('arm-none-eabi-nm',['-n',elf],{cwd:build,encoding:'utf8'});
    const match=nm.match(/^([0-9a-fA-F]+)\s+[Tt]\s+fault_handler$/m);
    assert.ok(match,'fault_handler address missing after optimized LTO link');
    const address=Number.parseInt(match[1],16);
    assert.ok(Number.isFinite(address)&&address>=0x08000000,'fault handler address is outside linked flash range');

    const rawLocation=execFileSync('arm-none-eabi-addr2line',['-f','-C','-e',elf,`0x${address.toString(16)}`],{cwd:workspace,encoding:'utf8'});
    assert.match(rawLocation,/fault_handler/);
    assert.match(rawLocation,/fault\.c:\d+/);

    const text=`HardFault PC=0x${address.toString(16)} LR=0x${address.toString(16)} CFSR=0x00010000`;
    const symbols=symbolizeEmbedded({text,elfFile:elf,mapFile:map,tool:'arm-none-eabi-addr2line',cwd:workspace});
    const elfRow=symbols.resolutions.find(row=>row.source==='elf'&&row.register==='pc');
    const mapRow=symbols.resolutions.find(row=>row.source==='map'&&row.register==='pc');
    assert.equal(elfRow.function,'fault_handler');
    assert.match(elfRow.location,/^src\/fault\.c:\d+$/);
    assert.equal(mapRow?.resolution?.name,'fault_handler');
    assert.equal(mapRow?.resolution?.offset,0);
    assert.doesNotMatch(JSON.stringify(symbols),new RegExp(regexEscape(build)),'external optimized build root leaked into symbol evidence');

    const evidence=buildDebugEvidence({text,source:{type:'file',label:'optimized-hardfault.log'},workspace,git:collectGitContext(workspace),embeddedSymbols:symbols});
    assert.equal(evidence.kind,'mcu');
    assert.ok(evidence.sourceContext.some(row=>row.file==='src/fault.c'&&/fault_handler/.test(row.text)),'optimized/LTO DWARF source did not bind into source context');
    assert.doesNotMatch(JSON.stringify(evidence),new RegExp(regexEscape(build)));
  }finally{
    fs.rmSync(workspace,{recursive:true,force:true});
    fs.rmSync(build,{recursive:true,force:true});
  }
});
