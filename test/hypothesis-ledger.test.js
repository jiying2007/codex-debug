'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {createHypothesisLedger,confirmHypothesis}=require('../src/hypothesis-ledger');
test('model cannot self-confirm hypothesis',()=>{const ledger=createHypothesisLedger([{id:'H1',title:'race',claim:'race',status:'confirmed'}],{evidenceDigest:'a'.repeat(64)});assert.equal(ledger.entries[0].status,'supported');const verified=confirmHypothesis(ledger,'H1',{verificationEvidence:['repro exited 0 after fix']});assert.equal(verified.entries[0].status,'confirmed');});
