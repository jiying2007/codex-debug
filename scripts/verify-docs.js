#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const contract=JSON.parse(read('product-contract.json'));
assert.equal(contract.lifecycle,'development','development baseline must remain lifecycle=development until explicit promotion');
assert.equal(contract.productVersion,'0.1.7','docs gate expects current development identity 0.1.7');
assert.equal(contract.promotionCorpusVersion,2,'docs gate expects Promotion Corpus v2');
const en=read('README.md'),zh=read('README.zh-CN.md'),arch=read('ARCHITECTURE.md'),security=read('SECURITY.md'),roadmap=read('ROADMAP.md'),modelEval=read('MODEL_EVALUATION.md'),projection=read('docs/INSUFFICIENT_EVIDENCE_PROJECTION.md');
for(const flag of ['--core','--executable','--elf','--map','--addr2line','--bisect-good','--allow-historical-execution','--resume','--verify-command','--apply-session','--rollback-session','--kernel-system-map','--kernel-kaslr-slide','--kernel-module-symbol']){assert.ok(en.includes(flag),`README missing ${flag}`);assert.ok(zh.includes(flag),`README.zh-CN missing ${flag}`);}
for(const term of ['passed-unbound','development','verified fix does not by itself confirm a root-cause hypothesis','kaslr-unproven','EKASLRMISMATCH','module-build-id-required','module-build-id-mismatch','receipt-bound rollback child','EROLLBACKCONSUMED','EDEBUGROLLBACKBINDING'])assert.ok(en.toLowerCase().includes(term.toLowerCase()),`README missing ${term}`);
for(const term of ['development Family consumer','workspace freshness','Debug Receipt','append-only','Consumer CI Receipt','KASLR slide','kernel-module-buildid','rollback-receipt-lineage'])assert.ok(arch.toLowerCase().includes(term.toLowerCase()),`ARCHITECTURE missing ${term}`);
for(const term of ['Historical execution','not an OS sandbox','contents: read','Promotion provenance versus historical execution','Promotion Corpus Qualification'])assert.ok(security.toLowerCase().includes(term.toLowerCase()),`SECURITY missing ${term}`);
assert.match(security,/Promotion Provenance must\s+(?:\*\*)?not(?:\*\*)?:[\s\S]{0,900}receive model\/API credentials/i);
assert.match(security,/Actual bad-fails\/fixed-passes proof remains in the manual `Promotion Corpus Qualification` authority domain/i);
for(const term of ['modelEvaluationRecordVersion = 1','promotionCorpusVersion = 2','promotionTransitionVersion = 1','12 unique reviewed historical cases','3 distinct repositories','4 failure kinds','3 authentic insufficient-evidence variants','Insufficient-evidence variants','summary-only','patchPolicy = forbidden','includeGitHistory=false','no raw stdout/stderr','three authentic insufficient-evidence variants','6/12','4/3','4/4','model-evaluation views: `9`','only structural readiness gap','cases 6/12','Promotion Provenance intentionally sees **6 historical transitions, not 9 evaluation views**'])assert.ok(modelEval.toLowerCase().includes(term.toLowerCase()),`MODEL_EVALUATION missing ${term}`);
assert.match(modelEval,/do\s+(?:\*\*)?not(?:\*\*)?\s+inherit[^\n]{0,160}`OPENAI_API_KEY`/i);
assert.match(modelEval,/following statements are\s+(?:\*\*)?not(?:\*\*)?\s+allowed until corresponding artifacts exist/i);
for(const forbiddenClaim of ['the promotion corpus is ready','live RCA precision meets a production target','live insufficient-evidence accuracy meets a production target','false-fix rate is production-proven across real repositories','live token efficiency is calibrated at production scale','ready to move from `development` to `active`'])assert.ok(modelEval.toLowerCase().includes(forbiddenClaim.toLowerCase()),`MODEL_EVALUATION missing forbidden claim: ${forbiddenClaim}`);
for(const term of ['Promotion Corpus v2','summary-only','patchPolicy=forbidden','raw stdout/stderr','Git history','ground-truth summary','ground-truth files','six unique reviewed transitions and three authentic insufficient variants','nine model-evaluation views','3/3','6/12','does **not** prove live-model insufficient-evidence accuracy'])assert.ok(projection.toLowerCase().includes(term.toLowerCase()),`projection security doc missing ${term}`);
for(const implemented of ['Promotion Corpus v2 insufficient-evidence variant contract','three authentic insufficient-evidence variants','6/12','4/3','4/4','0.1.7','Promotion Provenance continues to prove exactly 6 historical transitions'])assert.ok(roadmap.toLowerCase().includes(implemented.toLowerCase()),`ROADMAP missing ${implemented}`);
assert.match(roadmap,/\[x\].*three authentic insufficient-evidence variants/i);
assert.match(roadmap,/\[x\].*package \/ package-lock \/ product-contract development identity.*0\.1\.7/i);
for(const pending of ['add at least 6 more unique reviewed historical transitions','recorded credential-backed live-model RCA corpus','live-model false-fix and patch-applicability benchmark across real repositories','live model token-usage calibration','explicit model behavioral canary where credentials are available'])assert.match(roadmap,new RegExp(`\\[ \\].*${pending.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'i'));
assert.doesNotMatch(roadmap,/\[ \].*add 3 authentic insufficient-evidence variants/i,'authentic insufficient variants are now implemented');
process.stdout.write(JSON.stringify({lifecycle:contract.lifecycle,version:contract.productVersion,status:'current',modelEvaluationV1:true,promotionCorpusV2:true,promotionProjectionV1:true,promotionCorpusCases:6,promotionCorpusRepositories:4,promotionCorpusFailureKinds:4,promotionCorpusInsufficientCases:3,promotionEvaluationViews:9,livePromotionMetrics:false})+'\n');
