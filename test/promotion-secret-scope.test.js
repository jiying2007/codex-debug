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

test('promotion workflow scopes the generic live model credential to exactly one step',()=>{
  const jobEnv=section('    env:\n','    steps:\n');
  assert.doesNotMatch(jobEnv,/CODEX_DEBUG_PROVIDER_API_KEY:\s*\$\{\{\s*secrets\./,'model credential must not be job-scoped');
  assert.doesNotMatch(jobEnv,/OPENAI_API_KEY:\s*\$\{\{\s*secrets\./,'OpenAI credential must not be job-scoped');

  const startLabel='      - name: Record historical live-model evaluation\n';
  const endLabel='      - name: Fail closed on model safety regressions\n';
  const live=section(startLabel,endLabel);
  const start=workflow.indexOf(startLabel),end=workflow.indexOf(endLabel,start+startLabel.length),outside=`${workflow.slice(0,start)}${workflow.slice(end)}`;
  assert.match(live,/CODEX_DEBUG_PROVIDER_API_KEY:\s*\$\{\{\s*secrets\.CODEX_DEBUG_CANARY_PROVIDER_API_KEY\s*\|\|\s*secrets\.CODEX_DEBUG_CANARY_OPENAI_API_KEY\s*\|\|\s*secrets\.OPENAI_API_KEY\s*\}\}/);
  assert.match(live,/test -n "\$\{CODEX_DEBUG_PROVIDER_API_KEY:-\}"/,'live step must fail closed when provider credential is unavailable');
  assert.match(live,/export OPENAI_API_KEY="\$CODEX_DEBUG_PROVIDER_API_KEY"/,'OpenAI compatibility mapping must remain inside the live step');
  assert.match(live,/promotion-live-eval\.js/);
  assert.doesNotMatch(outside,/secrets\.(?:CODEX_DEBUG_CANARY_PROVIDER_API_KEY|CODEX_DEBUG_CANARY_OPENAI_API_KEY|OPENAI_API_KEY)/,'provider secret may appear only in the live-model step');
});

test('qualification and post-model evidence steps cannot receive the model credential through workflow env',()=>{
  const qualification=section('      - name: Qualify historical transitions for this exact evaluation run\n','      - name: Record historical live-model evaluation\n');
  const postModel=section('      - name: Fail closed on model safety regressions\n',null);
  assert.doesNotMatch(qualification,/CODEX_DEBUG_PROVIDER_API_KEY:\s*\$\{\{\s*secrets\./);
  assert.doesNotMatch(qualification,/OPENAI_API_KEY:\s*\$\{\{\s*secrets\./);
  assert.doesNotMatch(postModel,/CODEX_DEBUG_PROVIDER_API_KEY:\s*\$\{\{\s*secrets\./);
  assert.doesNotMatch(postModel,/OPENAI_API_KEY:\s*\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow,/Require protected live-model credential/,'credential-only preflight step would unnecessarily broaden secret exposure');
  assert.match(workflow,/permissions:\s*\n\s+contents:\s*read\b/);
});
