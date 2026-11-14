'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createHypothesisLedger,confirmHypothesis}=require('../src/hypothesis-ledger');
const {applyCausalVerification}=require('../src/codex');
const {confirmSupported}=require('../src/debug');
const {summarizeSeries}=require('../src/reproduction');
function verifiedDraft(ids=['H1']){
  const draft={rootCause:'race',confidence:.9,hypotheses:ids.map(id=>({id,title:'race',claim:'race',status:'supported'})),patch:{unifiedDiff:'fixture'},coverageGaps:[]};
  return applyCausalVerification(draft,{rootCauseAssessment:'supported',confidence:.8,hypotheses:ids.map(id=>({id,status:'supported',evidence:[`${id} trace`],reason:'source mechanism'})),patchDisposition:'accept',coverageGaps:[]});
}
test('a supported draft alone cannot become a confirmed cause',()=>{
  const ledger=createHypothesisLedger([{id:'H1',title:'race',claim:'race',status:'confirmed'}]);
  assert.equal(ledger.entries[0].status,'supported');
  assert.equal(confirmHypothesis(ledger,'H1',{verificationEvidence:['post-fix pass']}).entries[0].status,'supported');
});
test('per-hypothesis verifier provenance and post-fix evidence are both required',()=>{
  const investigation=verifiedDraft(),ledger=createHypothesisLedger(investigation.hypotheses);
  assert.equal(confirmHypothesis(ledger,'H1').entries[0].status,'supported');
  assert.equal(confirmHypothesis(ledger,'H1',{verificationEvidence:['observed bound post-fix pass']}).entries[0].status,'confirmed');
});
test('runtime never picks an arbitrary supported alternative or confirms a manual change',()=>{
  const before=summarizeSeries([{command:'test',exitCode:1,stderr:'fatal error',durationMs:1}]),after=summarizeSeries([{command:'test',exitCode:0,durationMs:1}]);
  for(const ids of [['H1'],['H1','H2']]){
    const investigation=verifiedDraft(ids),ledger=createHypothesisLedger(investigation.hypotheses);
    assert.equal(confirmSupported(ledger,before,after,{investigation}),ledger);
    const result=confirmSupported(ledger,before,after,{investigation,patchResult:{applied:true}});
    assert.equal(result.entries.filter(h=>h.status==='confirmed').length,ids.length===1?1:0);
  }
});
