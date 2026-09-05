'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {detectFailureKind,parseFailure}=require('../src/parsers');
test('classifies sanitizer before generic crash',()=>{assert.equal(detectFailureKind('ERROR: AddressSanitizer: heap-use-after-free'),'sanitizer');});
test('classifies embedded hard fault',()=>{assert.equal(detectFailureKind('HardFault CFSR=0x82 PC=0x08001234 LR=0xfffffff9'),'mcu');});
test('extracts source frames',()=>{const p=parseFailure('#0 crash at src/audio.c:418\n at foo (lib/x.js:72:3)');assert.ok(p.frames.some(f=>f.file.includes('src/audio.c')&&f.line===418));assert.ok(p.frames.some(f=>f.file.includes('lib/x.js')&&f.line===72));});
