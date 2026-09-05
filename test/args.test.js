'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {parseArgs}=require('../src/args');
test('parses explicit authority separately',()=>{const a=parseArgs(['--command','npm test','--apply','--verify-command','npm run regression','--deterministic-only']);assert.equal(a.command,'npm test');assert.equal(a.apply,true);assert.equal(a.verifyCommand,'npm run regression');assert.equal(a.deterministicOnly,true);});
test('rejects unknown flags',()=>assert.throws(()=>parseArgs(['--magic']),/Unknown argument/));
