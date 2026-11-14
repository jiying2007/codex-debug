'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const corpus=require('../quality/promotion-corpus.json');
const {validatePromotionCorpus,promotionReadiness}=require('../scripts/promotion-corpus');
const {assertPositiveControls}=require('../scripts/historical-case');
const clone=value=>JSON.parse(JSON.stringify(value));

test('reviewed historical partitions count independent roots and keep the HTTP lineage together',()=>{
  validatePromotionCorpus(corpus);
  assert.equal(corpus.cases.length,22);
  assert.equal(promotionReadiness(corpus).rootCauseGroups,20);
  assert.equal(corpus.cases.filter(x=>x.partition==='dev').length,18);
  assert.equal(corpus.cases.filter(x=>x.partition==='holdout').length,4);
  const http=corpus.cases.filter(x=>x.rootCauseGroup==='http-response-buffering-limit');
  assert.equal(http.length,3);
  assert.ok(http.every(x=>x.partition==='dev'));
  assert.equal(corpus.partitionPolicy.blind,false);
  assert.ok(corpus.cases.every(x=>x.exposure==='reviewed-retrospective'));
  assert.equal(corpus.promotionEligible,false);
});

test('related cases cannot leak across dev and holdout or claim unseen status',()=>{
  const split=clone(corpus);
  split.cases.find(x=>x.rootCauseGroup==='http-response-buffering-limit').partition='holdout';
  assert.throws(()=>validatePromotionCorpus(split),/root-cause group crosses dev\/holdout/);
  const blind=clone(corpus);blind.partitionPolicy.blind=true;
  assert.throws(()=>validatePromotionCorpus(blind),/non-blind root-cause groups/);
  const unseen=clone(corpus);unseen.cases[0].exposure='unseen';
  assert.throws(()=>validatePromotionCorpus(unseen),/must not claim unseen evidence/);
});

test('case volume cannot satisfy the independent-root floor',()=>{
  const value=clone(corpus),dev=value.cases.filter(x=>x.partition==='dev');
  dev[0].rootCauseGroup=dev[1].rootCauseGroup;
  validatePromotionCorpus(value);
  assert.equal(value.cases.length,22);
  assert.equal(promotionReadiness(value).ready,false);
  assert.deepEqual(promotionReadiness(value).gaps,['rootCauseGroups 19/20']);
  value.promotionEligible=true;
  assert.throws(()=>validatePromotionCorpus(value),/rootCauseGroups 19\/20/);
});

test('the new executable positive controls must complete before a historical failure counts',()=>{
  const items=corpus.cases.filter(x=>x.reproduction.positiveControls);
  assert.equal(items.length,10);
  for(const item of items){
    assertPositiveControls(item,{representative:{stdout:'POSITIVE_CONTROLS_PASS\n'}},'bad');
    assert.throws(()=>assertPositiveControls(item,{representative:{stdout:''}},'bad'),/positive controls did not complete on bad/);
    assert.throws(()=>assertPositiveControls(item,{representative:{stdout:'not POSITIVE_CONTROLS_PASS\n'}},'fixed'),/positive controls did not complete on fixed/);
  }
  const invalid=clone(corpus),item=invalid.cases.find(x=>x.reproduction.positiveControls);
  item.reproduction.command=item.reproduction.command.replace('POSITIVE_CONTROLS_PASS','NO_MARKER');
  assert.throws(()=>validatePromotionCorpus(invalid),/observable marker/);
});
