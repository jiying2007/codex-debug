'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {parseLog}=require('../src/git-causality');
test('causal git rows stay candidates with file identity',()=>{const sha='a'.repeat(40),rows=parseLog(`${sha}\t2026-01-01T00:00:00Z\tchange lifetime`,'src/a.c');assert.equal(rows[0].sha,sha);assert.equal(rows[0].file,'src/a.c');});
