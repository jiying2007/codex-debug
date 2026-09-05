'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {buildDebugEvidence}=require('../src/evidence');
test('builds stable bounded evidence and redacts likely token',()=>{const input='fatal error: nope\nAuthorization: Bearer secret-value\n';const a=buildDebugEvidence({text:input,workspace:process.cwd(),git:{head:'abc'}}),b=buildDebugEvidence({text:input,workspace:process.cwd(),git:{head:'abc'}});assert.equal(a.digest,b.digest);assert.equal(a.kind,'build');assert.doesNotMatch(a.compact.text,/secret-value/);});
