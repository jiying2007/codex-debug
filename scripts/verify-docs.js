#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const contract=JSON.parse(read('product-contract.json'));
assert.equal(contract.lifecycle,'development','development baseline must remain lifecycle=development until explicit promotion');
const en=read('README.md'),zh=read('README.zh-CN.md'),arch=read('ARCHITECTURE.md'),security=read('SECURITY.md'),roadmap=read('ROADMAP.md');
for(const flag of ['--core','--executable','--elf','--map','--addr2line','--bisect-good','--allow-historical-execution','--resume','--verify-command','--apply-session','--rollback-session','--kernel-system-map','--kernel-kaslr-slide','--kernel-module-symbol']){
  assert.ok(en.includes(flag),`README missing ${flag}`);
  assert.ok(zh.includes(flag),`README.zh-CN missing ${flag}`);
}
for(const term of ['passed-unbound','first-parent','development','failure transition','patch snapshots','verified fix does not by itself confirm a root-cause hypothesis','arm-none-eabi-addr2line','kaslr-unproven','EKASLRMISMATCH','module-build-id-required','module-build-id-mismatch']){
  assert.ok(en.toLowerCase().includes(term.toLowerCase()),`README missing ${term}`);
}
assert.ok(zh.includes('修复进入 `verified` 并不自动等于根因 hypothesis 被确认'),'README.zh-CN missing verified-vs-causal distinction');
for(const term of ['development Family consumer','first-parent','workspace freshness','Debug Receipt','append-only','fresh temporary clone','PC/LR -> map/ELF symbol','Development Consumer Evidence pipeline','Consumer CI Receipt','KASLR slide','kaslr-unproven','EKASLRMISMATCH','two independent identity domains','logged BuildId','kernel-module-buildid']){
  assert.ok(arch.toLowerCase().includes(term.toLowerCase()),`ARCHITECTURE missing ${term}`);
}
for(const term of ['debuginfod','Historical execution','not an OS sandbox','successful unbound','hard-linked','append-only','credential-like environment variables','self-digest','Embedded ELF / map symbolization hardening','Development Consumer Evidence','@vscode/vsce@3.9.2','contents: read','Kernel System.map / KASLR hardening','kaslr-unproven','EKASLRMISMATCH','Kernel module BuildId hardening','module-build-id-required','module-build-id-mismatch','kernel-module-buildid']){
  assert.ok(security.toLowerCase().includes(term.toLowerCase()),`SECURITY missing ${term}`);
}
assert.match(roadmap,/\[x\].*Safe Bisect/);
assert.match(roadmap,/\[x\].*addr2line ELF symbolization/);
assert.match(roadmap,/\[x\].*reproducible development VSIX gate/);
assert.match(roadmap,/\[x\].*Consumer CI Receipt/);
assert.match(roadmap,/\[x\].*executable fix-quality benchmark/);
assert.match(roadmap,/\[x\].*falseVerified=0.*regressionEscapes=0.*failureReplacementEscapes=0/);
assert.match(roadmap,/\[x\].*KASLR-aware base-kernel symbolization/);
assert.match(roadmap,/\[x\].*non-zero-KASLR Oops\/System\.map fixture/);
assert.match(roadmap,/\[x\].*kernel module.*BuildId/i);
assert.match(roadmap,/\[x\].*relocatable.*\.ko/i);
assert.doesNotMatch(roadmap,/\[ \].*reproducible VSIX build plus Consumer CI Receipt/);
assert.doesNotMatch(roadmap,/\[ \].*verified-fix rate and regression-escape metric/);
assert.doesNotMatch(roadmap,/\[ \].*KASLR-aware kernel symbol/);
assert.doesNotMatch(roadmap,/\[ \].*kernel module-specific map\/ELF identity handling/);
assert.match(roadmap,/\[ \].*recorded live-model RCA corpus/);
process.stdout.write(JSON.stringify({lifecycle:contract.lifecycle,docs:['README.md','README.zh-CN.md','ARCHITECTURE.md','SECURITY.md','ROADMAP.md'],status:'current',consumerEvidence:true,executableFixQuality:true,kernelKaslr:true,kernelModuleBuildId:true})+'\n');
