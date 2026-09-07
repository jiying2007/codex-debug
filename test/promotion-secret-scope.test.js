'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','promotion-model-eval.yml'),'utf8');

function section(startLabel,endLabel){
  const start=workflow.indexOf(startLabel);
  assert.ok(start>=0,`missing section ${startLabel}`);
  const end=endLabel?workflow.indexOf(endLabel,start+startLabel.length):workflow.length;
  assert.ok(end>start,`missing section boundary after ${startLabel}`);
  return workflow.slice(start,end);
}

test('promotion workflow scopes the live model credential to exactly one step',()=>{
  const jobEnv=section('    env:\n','    steps:\n');
  assert.doesNotMatch(jobEnv,/OPENAI_API_KEY/,'model credential must not be job-scoped');
  const occurrences=workflow.match(/OPENAI_API_KEY:\s*\$\{\{\s*secrets\./g)||[];
  assert.equal(occurrences.length,1,'exactly one workflow step may receive OPENAI_API_KEY');

  const live=section('      - name: Record historical live-model evaluation\n','      - name: Fail closed on model safety regressions\n');
  assert.match(live,/OPENAI_API_KEY:\s*\$\{\{\s*secrets\.CODEX_DEBUG_CANARY_OPENAI_API_KEY\s*\|\|\s*secrets\.OPENAI_API_KEY\s*\}\}/);
  assert.match(live,/test -n "\$\{OPENAI_API_KEY:-\}"/,'live step must fail closed when credential is unavailable');
  assert.match(live,/promotion-live-eval\.js/);
});

test('qualification and post-model evidence steps cannot receive the model credential through workflow env',()=>{
  const qualification=section('      - name: Qualify historical transitions for this exact evaluation run\n','      - name: Record historical live-model evaluation\n');
  const postModel=section('      - name: Fail closed on model safety regressions\n',null);
  assert.doesNotMatch(qualification,/OPENAI_API_KEY/);
  assert.doesNotMatch(postModel,/OPENAI_API_KEY/);
  assert.doesNotMatch(workflow,/Require protected live-model credential/,'credential-only preflight step would unnecessarily broaden secret exposure');
  assert.match(workflow,/permissions:\s*\n\s+contents:\s*read\b/);
});
