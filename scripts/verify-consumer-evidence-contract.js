#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function verifyConsumerEvidenceContract(){
  const workflow=fs.readFileSync(path.join(root,'.github','workflows','ci.yml'),'utf8');
  assert.match(workflow,/\n  promotion-provenance:\n/,'CI must define promotion-provenance job');
  assert.match(workflow,/promotion-provenance:[\s\S]*?permissions:\s*\n\s+contents:\s*read\b/,'Promotion Provenance must remain read-only');
  assert.match(workflow,/promotion-provenance:[\s\S]*?promotion-provenance\.js --output promotion-provenance\/PROMOTION_PROVENANCE\.json/,'Promotion Provenance must prove reviewed Git history');
  assert.match(workflow,/promotion-provenance:[\s\S]*?actions\/upload-artifact@[0-9a-f]{40}/,'Promotion Provenance artifact action must be SHA pinned');
  assert.match(workflow,/\n  consumer-evidence:\n/,'CI must define consumer-evidence job');
  assert.match(workflow,/consumer-evidence:[\s\S]*?needs:\s*\[test, security, promotion-provenance\]/,'Consumer Evidence must depend on test, security, and promotion provenance');
  assert.match(workflow,/consumer-evidence:[\s\S]*?permissions:\s*\n\s+contents:\s*read\b/,'Consumer Evidence must remain read-only');
  assert.match(workflow,/npx --yes @vscode\/vsce@3\.9\.2 package --no-dependencies --out codex-debug-safe-a\.vsix/,'first VSIX build must use exact VSCE 3.9.2');
  assert.match(workflow,/npx --yes @vscode\/vsce@3\.9\.2 package --no-dependencies --out codex-debug-safe-b\.vsix/,'second VSIX build must use exact VSCE 3.9.2');
  assert.match(workflow,/test "\$sha_a" = "\$sha_b"/,'VSIX candidates must be byte-identical');
  assert.match(workflow,/version=\$\(node -p "require\('\.\/package\.json'\)\.version"\)/,'Consumer Evidence must derive product version from package.json');
  assert.match(workflow,/vsix_name="codex-debug-safe-\$\{version\}\.vsix"/,'final VSIX name must derive from the product version');
  assert.match(workflow,/evidence_dir=consumer-evidence/,'Consumer Evidence must use a dedicated staging directory');
  assert.match(workflow,/generate-consumer-ci-receipt\.js --output "\$evidence_dir\/CONSUMER_CI_RECEIPT\.json"/,'Safe Core Consumer CI Receipt must be generated inside the evidence directory');
  assert.match(workflow,/CI_SUITES:[^\n]*promotion-provenance/,'Consumer CI Receipt suite lineage must bind promotion provenance');
  assert.match(workflow,/\(cd "\$evidence_dir" && sha256sum "\$vsix_name" CONSUMER_CI_RECEIPT\.json > SHA256SUMS\)/,'VSIX and Receipt checksums must be generated over version-derived evidence basenames');
  assert.match(workflow,/path:\s*consumer-evidence\//,'only the staged Consumer Evidence directory must be uploaded');
  assert.doesNotMatch(workflow,/codex-debug-safe-\d+\.\d+\.\d+\.vsix/,'Consumer Evidence workflow must not hardcode a product-version VSIX filename');
  assert.match(workflow,/actions\/upload-artifact@[0-9a-f]{40}/,'Consumer evidence artifact action must be SHA pinned');
  assert.match(workflow,/needs:\s*\[test, security, promotion-provenance, consumer-evidence\]/,'top-level CI Gate must require Promotion Provenance and Consumer Evidence');
  for(const forbidden of [/\bcontents:\s*write\b/i,/\bid-token:\s*write\b/i,/\bvsce\s+publish\b/i,/\bnpm\s+publish\b/i,/\bgh\s+release\b/i,/\bgit\s+push\b/i])assert.doesNotMatch(workflow,forbidden,'Consumer Evidence workflow must not gain publication authority');
  return {consumerEvidence:true,promotionProvenance:true,vsce:'3.9.2',doublePackage:true,receipt:true,readOnly:true,versionDerivedVsix:true};
}
if(require.main===module){try{process.stdout.write(`${JSON.stringify(verifyConsumerEvidenceContract())}\n`);}catch(error){console.error(error.stack||error.message);process.exitCode=2;}}
module.exports={verifyConsumerEvidenceContract};
