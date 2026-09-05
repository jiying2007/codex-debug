'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {decodeCortexMFault}=require('../src/embedded');
test('decodes Cortex-M CFSR/HFSR bits and fault addresses',()=>{const d=decodeCortexMFault('HardFault CFSR=0x02008200 HFSR=0x40000000 BFAR=0x20001234 PC=0x08001000 LR=0xfffffff9');assert.ok(d.cfsrFlags.includes('PRECISERR'));assert.ok(d.cfsrFlags.includes('BFARVALID'));assert.ok(d.cfsrFlags.includes('DIVBYZERO'));assert.ok(d.hfsrFlags.includes('FORCED'));assert.equal(d.registers.bfar,0x20001234);});
