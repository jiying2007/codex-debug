#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function verifyConsumerEvidenceContract(){
  const workflow=fs.readFileSync(path.join(root,'.github','workflows','ci.yml'),'utf8');
  assert.match(workflow,/\n  consumer-evidence:\n/,'CI must define consumer-evidence job');
  assert.match(workflow,/consumer-evidence:[\s\S]*?needs:\s*\[test, security\]/,'Consumer Evidence must depend on test and security');
  assert.match(workflow,/consumer-evidence:[\s\S]*?permissions:\s*\n\s+contents:\s*read\b/,'Consumer Evidence must remain read-only');
  assert.match(workflow,/npx --yes @vscode\/vsce@3\.9\.2 package --no-dependencies --out codex-debug-safe-a\.vsix/,'first VSIX build must use exact VSCE 3.9.2');
  assert.match(workflow,/npx --yes @vscode\/vsce@3\.9\.2 package --no-dependencies --out codex-debug-safe-b\.vsix/,'second VSIX build must use exact VSCE 3.9.2');
  assert.match(workflow,/test "\$sha_a" = "\$sha_b"/,'VSIX candidates must be byte-identical');
  assert.match(workflow,/generate-consumer-ci-receipt\.js --output CONSUMER_CI_RECEIPT\.json/,'Safe Core Consumer CI Receipt must be generated');
  assert.match(workflow,/sha256sum codex-debug-safe-0\.1\.0\.vsix CONSUMER_CI_RECEIPT\.json > SHA256SUMS/,'VSIX and Receipt checksums must be generated');
  assert.match(workflow,/actions\/upload-artifact@[0-9a-f]{40}/,'Consumer evidence artifact action must be SHA pinned');
  assert.match(workflow,/needs:\s*\[test, security, consumer-evidence\]/,'top-level CI Gate must require Consumer Evidence');
  for(const forbidden of [/\bcontents:\s*write\b/i,/\bid-token:\s*write\b/i,/\bvsce\s+publish\b/i,/\bnpm\s+publish\b/i,/\bgh\s+release\b/i,/\bgit\s+push\b/i])assert.doesNotMatch(workflow,forbidden,'Consumer Evidence workflow must not gain publication authority');
  return {consumerEvidence:true,vsce:'3.9.2',doublePackage:true,receipt:true,readOnly:true};
}
if(require.main===module){try{process.stdout.write(`${JSON.stringify(verifyConsumerEvidenceContract())}\n`);}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={verifyConsumerEvidenceContract};
