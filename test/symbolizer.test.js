'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {debuggerInvocation,boundedOutput}=require('../src/symbolizer');
test('gdb invocation disables init files and uses fixed backtrace commands',()=>{const x=debuggerInvocation('gdb','/tmp/app','/tmp/core');assert.equal(x.command,'gdb');assert.deepEqual(x.args.slice(0,3),['-nx','-nh','-batch']);assert.equal(x.args.at(-2),'/tmp/app');assert.equal(x.args.at(-1),'/tmp/core');});
test('lldb invocation disables init file and binds explicit core/executable',()=>{const x=debuggerInvocation('lldb','app','core');assert.equal(x.command,'lldb');assert.ok(x.args.includes('--no-lldbinit'));assert.ok(x.args.includes('--core'));assert.ok(x.args.includes('thread backtrace all -c 32'));});
test('symbolizer output is byte bounded',()=>{const x=boundedOutput('a'.repeat(100),16);assert.equal(Buffer.byteLength(x.text),16);assert.equal(x.truncated,true);});
