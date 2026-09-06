'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const product=require('../product-contract.json');
const {buildReceipt}=require('../src/codex-safe-core/scripts/generate-consumer-ci-receipt');

test('Safe Core Consumer CI Receipt binds Debug product and exact Core pin',()=>{
  const root=path.resolve(__dirname,'..');
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const receipt=buildReceipt(root,{sourceSha,workflow:'CI',runId:'fixture-run',runAttempt:1,event:'test',suites:['unit','consumer-evidence']});
  assert.equal(receipt.productId,'codex-debug-safe');
  assert.equal(receipt.productVersion,product.productVersion);
  assert.equal(receipt.sourceSha,sourceSha);
  assert.equal(receipt.corePin.sha,product.safeCoreCommit);
  assert.equal(receipt.corePin.version,product.safeCoreVersion);
  assert.equal(receipt.corePin.runtimeDigest,product.safeCoreRuntimeDigest);
  assert.equal(receipt.corePin.governanceDigest,product.safeCoreGovernanceDigest);
  assert.equal(receipt.ci.workflow,'CI');
  assert.equal(receipt.ci.conclusion,'success');
  assert.deepEqual(receipt.suites,['unit','consumer-evidence']);
  assert.match(receipt.receiptDigest,/^[0-9a-f]{64}$/);
});
