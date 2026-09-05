'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {validatePatch}=require('../src/patch');
test('accepts normal textual patch',()=>{const v=validatePatch('diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n-a\n+b\n');assert.ok(v.paths.includes('src/a.js'));});
test('rejects path traversal',()=>{assert.throws(()=>validatePatch('diff --git a/../x b/../x\n--- a/../x\n+++ b/../x\n@@ -1 +1 @@\n-a\n+b\n'),/Unsafe patch path/);});
test('rejects Safe Core mutation',()=>{assert.throws(()=>validatePatch('diff --git a/src/codex-safe-core/x b/src/codex-safe-core/x\n--- a/src/codex-safe-core/x\n+++ b/src/codex-safe-core/x\n@@ -1 +1 @@\n-a\n+b\n'),/Unsafe patch path/);});
