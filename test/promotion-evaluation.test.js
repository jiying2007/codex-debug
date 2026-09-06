'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const corpus=require('../quality/promotion-corpus.json');
const {stableDigest}=require('../scripts/model-evaluation');
const {validatePromotionCorpus,promotionReadiness,toEvaluationCorpus}=require('../scripts/promotion-corpus');
const {isolatedHistoricalEnv,runTransitionInRepo}=require('../scripts/historical-case');

function git(args,cwd){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function write(file,text){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text,'utf8');}
function clone(value){return JSON.parse(JSON.stringify(value));}

test('reviewed promotion corpus remains fail-closed below diversity floor',()=>{
  validatePromotionCorpus(corpus);
  const r=promotionReadiness(corpus);
  assert.equal(r.ready,false);
  assert.equal(r.cases,4);
  assert.equal(r.repositories,3);
  assert.equal(r.failureKinds,4);
  assert.equal(r.insufficientCases,0);
  assert.deepEqual(r.gaps,['cases 4/12','insufficientCases 0/3']);
  const evalCorpus=toEvaluationCorpus(corpus);
  assert.equal(evalCorpus.promotionEligible,false);
});

test('promotion corpus rejects ground-truth and expectation tampering',()=>{
  const changed=clone(corpus);
  changed.cases[0].groundTruth.summary+=' tampered';
  assert.throws(()=>validatePromotionCorpus(changed),/ground-truth digest mismatch/);
  const changedExpected=clone(corpus);
  changedExpected.cases[0].expected.assessment='contradicted';
  assert.throws(()=>validatePromotionCorpus(changedExpected),/expectation digest mismatch/);
});

test('promotionEligible cannot bypass the reviewed readiness floor',()=>{
  const changed=clone(corpus);
  changed.promotionEligible=true;
  assert.throws(()=>validatePromotionCorpus(changed),/promotionEligible cannot be true/);
});

test('historical execution environment drops model and GitHub credentials',()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-promotion-env-'));
  const oldApi=process.env.OPENAI_API_KEY,oldGh=process.env.GITHUB_TOKEN,oldPat=process.env.GH_TOKEN;
  process.env.OPENAI_API_KEY='secret-model';process.env.GITHUB_TOKEN='secret-github';process.env.GH_TOKEN='secret-gh';
  try{
    const env=isolatedHistoricalEnv(home);
    assert.equal(env.OPENAI_API_KEY,undefined);
    assert.equal(env.GITHUB_TOKEN,undefined);
    assert.equal(env.GH_TOKEN,undefined);
    assert.equal(env.HOME,home);
    assert.equal(env.USERPROFILE,home);
    assert.equal(env.GIT_TERMINAL_PROMPT,'0');
  }finally{
    if(oldApi===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldApi;
    if(oldGh===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=oldGh;
    if(oldPat===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=oldPat;
    fs.rmSync(home,{recursive:true,force:true});
  }
});

test('historical transition requires observed bad failure and direct fixed pass',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-debug-promotion-local-'));
  try{
    git(['init','-q'],root);git(['config','user.name','promotion-test'],root);git(['config','user.email','promotion@example.invalid'],root);
    write(path.join(root,'repro.js'),"'use strict';\nprocess.exitCode=1;\n");
    git(['add','.'],root);git(['commit','-qm','bad'],root);const bad=git(['rev-parse','HEAD'],root);
    write(path.join(root,'repro.js'),"'use strict';\nprocess.exitCode=0;\n");
    git(['add','.'],root);git(['commit','-qm','fix'],root);const fixed=git(['rev-parse','HEAD'],root);
    assert.equal(git(['rev-parse',`${fixed}^`],root),bad);
    const command=`${JSON.stringify(process.execPath)} repro.js`;
    const item={id:'local-direct-parent-fix',repository:'https://github.com/example/example.git',anchorRef:'refs/heads/main',badCommit:bad,fixedCommit:fixed,reproduction:{command,runs:1,timeoutMs:30000}};
    const transition=runTransitionInRepo(root,item,{env:process.env});
    assert.equal(transition.badSummary.reproducibleFailure,true);
    assert.equal(transition.badSummary.failures,1);
    assert.equal(transition.fixedSummary.failures,0);
    assert.equal(transition.commandDigest,stableDigest(command));
    assert.match(transition.transitionDigest,/^[0-9a-f]{64}$/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('promotion workflows are manual read-only and require historical execution acknowledgement',()=>{
  const root=path.join(__dirname,'..','.github','workflows');
  for(const file of ['promotion-corpus-qualify.yml','promotion-model-eval.yml']){
    const workflow=fs.readFileSync(path.join(root,file),'utf8');
    assert.match(workflow,/workflow_dispatch:/);
    assert.match(workflow,/permissions:\s*\n\s+contents:\s*read\b/);
    assert.match(workflow,/acknowledge_historical_execution/);
    assert.match(workflow,/!inputs\.acknowledge_historical_execution/);
    assert.match(workflow,/not an OS sandbox/i);
    for(const forbidden of [/\bcontents:\s*write\b/i,/\bid-token:\s*write\b/i,/\bnpm\s+publish\b/i,/\bvsce\s+publish\b/i,/\bgh\s+release\b/i,/\bgit\s+push\b/i])assert.doesNotMatch(workflow,forbidden);
  }
  const live=fs.readFileSync(path.join(root,'promotion-model-eval.yml'),'utf8');
  assert.match(live,/CODEX_DEBUG_CANARY_OPENAI_API_KEY/);
  assert.match(live,/promotion_mode/);
  assert.match(live,/CODEX_DEBUG_MODEL_SELECTION_STRATEGY/);
  assert.match(live,/inputs\.model != '' && 'fixed' \|\| 'auto'/);
});
