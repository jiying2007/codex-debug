'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const corpus=require('../quality/promotion-corpus.json');
const {validatePromotionCorpus,promotionReadiness,toEvaluationCorpus}=require('../scripts/promotion-corpus');
const {isolatedHistoricalEnv,runTransitionInRepo}=require('../scripts/historical-case');

function clone(value){return JSON.parse(JSON.stringify(value));}
function git(args,cwd){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}

test('reviewed promotion corpus is valid but intentionally not ready',()=>{
  validatePromotionCorpus(corpus);
  const ready=promotionReadiness(corpus);
  assert.equal(ready.ready,false);
  assert.equal(ready.cases,3);
  assert.equal(ready.repositories,2);
  assert.equal(ready.failureKinds,3);
  assert.equal(ready.insufficientCases,0);
  assert.deepEqual(ready.gaps,['cases 3/12','repositories 2/3','failureKinds 3/4','insufficientCases 0/3']);
  assert.equal(toEvaluationCorpus(corpus).promotionEligible,false);
});

test('promotion eligibility cannot be enabled below the reviewed diversity floor',()=>{
  const changed=clone(corpus);changed.promotionEligible=true;
  assert.throws(()=>validatePromotionCorpus(changed),/promotionEligible cannot be true/);
});

test('ground-truth and expectation tampering fail closed',()=>{
  const changed=clone(corpus);changed.cases[0].groundTruth.summary+=' tampered';
  assert.throws(()=>validatePromotionCorpus(changed),/ground-truth digest mismatch/);
  const changed2=clone(corpus);changed2.cases[0].expected.rootCauseTerms=['anything'];
  assert.throws(()=>validatePromotionCorpus(changed2),/expectation digest mismatch/);
});

test('duplicate reviewed historical transitions cannot inflate readiness',()=>{
  const changed=clone(corpus),duplicate=clone(corpus.cases[0]);
  duplicate.id='duplicate-transition-must-fail';
  changed.cases.push(duplicate);
  assert.throws(()=>validatePromotionCorpus(changed),/duplicate historical transition|duplicate badCommit|duplicate fixedCommit/);
});

test('historical execution environment does not inherit model or repository credentials',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-env-'));
  const prior={OPENAI_API_KEY:process.env.OPENAI_API_KEY,GITHUB_TOKEN:process.env.GITHUB_TOKEN,GH_TOKEN:process.env.GH_TOKEN};
  try{
    process.env.OPENAI_API_KEY='secret-openai';process.env.GITHUB_TOKEN='secret-github';process.env.GH_TOKEN='secret-gh';
    const env=isolatedHistoricalEnv(root);
    assert.equal(env.OPENAI_API_KEY,undefined);
    assert.equal(env.GITHUB_TOKEN,undefined);
    assert.equal(env.GH_TOKEN,undefined);
    assert.ok(env.PATH||env.Path);
    assert.equal(env.GIT_TERMINAL_PROMPT,'0');
  }finally{
    for(const [k,v] of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('controller proves exact bad-fails fixed-passes transition in a local historical repo',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-transition-')),home=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-transition-home-'));
  try{
    git(['init','-q'],root);git(['config','user.name','fixture'],root);git(['config','user.email','fixture@example.invalid'],root);
    fs.writeFileSync(path.join(root,'repro.js'),"'use strict';\nconsole.error('fixture failure');process.exit(1);\n",'utf8');git(['add','repro.js'],root);git(['commit','-qm','bad'],root);const bad=git(['rev-parse','HEAD'],root);
    fs.writeFileSync(path.join(root,'repro.js'),"'use strict';\nprocess.exit(0);\n",'utf8');git(['add','repro.js'],root);git(['commit','-qm','fixed'],root);const fixed=git(['rev-parse','HEAD'],root);
    const item={id:'local-transition',repository:'https://github.com/example/example.git',badCommit:bad,fixedCommit:fixed,reproduction:{command:`${JSON.stringify(process.execPath)} repro.js`,runs:1,timeoutMs:30000}};
    const result=runTransitionInRepo(root,item,{env:isolatedHistoricalEnv(home)});
    assert.equal(result.badSummary.reproducibleFailure,true);
    assert.equal(result.fixedSummary.failures,0);
    assert.match(result.transitionDigest,/^[0-9a-f]{64}$/);
  }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(home,{recursive:true,force:true});}
});

test('promotion workflow is manual, read-only, manifest-bound and requires historical authority',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','promotion-model-eval.yml'),'utf8');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/contents:\s*read\b/);
  assert.match(workflow,/acknowledge_historical_execution/);
  assert.match(workflow,/not an OS sandbox/i);
  assert.match(workflow,/quality\/promotion-corpus\.json/);
  assert.match(workflow,/inputs\.model != '' && 'fixed' \|\| 'auto'/);
  assert.doesNotMatch(workflow,/\bcontents:\s*write\b/i);
  assert.doesNotMatch(workflow,/\bid-token:\s*write\b/i);
  assert.doesNotMatch(workflow,/\bgit\s+push\b/i);
  assert.doesNotMatch(workflow,/\bgh\s+release\b/i);
});
