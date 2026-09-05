'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {runExplicitCommand}=require('../src/runner');
test('runs only the explicit command and captures status',()=>{const r=runExplicitCommand(`${JSON.stringify(process.execPath)} -e "process.exit(3)"`,{timeoutMs:5000});assert.equal(r.exitCode,3);assert.equal(r.timedOut,false);});
