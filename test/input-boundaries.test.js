'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {buildDebugEvidence,readBoundedFile}=require('../src/evidence');
const {buildDebugPrompt,buildCausalVerificationPrompt}=require('../src/codex');
const {writeSession,readSession}=require('../src/session-store');
const {loadArtifacts}=require('../src/artifacts');

test('all model-visible evidence and draft fields pass through the shared sanitizer',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debug-secret-input-'));
  try{
    fs.writeFileSync(path.join(dir,'issue.sarif'),JSON.stringify({runs:[{results:[{message:{text:'password=sarifCanary123456789'},locations:[{physicalLocation:{artifactLocation:{uri:'https://example.invalid/a?token=uriCanary123456789'}}}]}]}]}));
    fs.writeFileSync(path.join(dir,'tests.xml'),'<testsuite tests="1" failures="1"><failure message="secret=junitCanary123456789">failed</failure></testsuite>');
    const evidence=buildDebugEvidence({workspace:dir,text:'fatal error: failure',artifactSpecs:['sarif:issue.sarif','junit:tests.xml']});
    const enriched={...evidence,sourceContext:[{file:'src/a.js',start:1,end:2,text:'api_key=sourceCanary123456789',history:['abc password=historyCanary123456789']}],causalHistory:{candidates:[{sha:'abc',score:1,files:['x'],reasons:[],subject:'secret=candidateCanary123456789'}]}};
    const gitContext={recentCommits:[{sha:'abc',date:'2026-01-01',subject:'Authorization: Bearer commitCanary123456789'}]};
    const investigation={rootCause:'secret=draftCanary123456789',patch:{unifiedDiff:'api_key=patchCanary123456789'}};
    for(const prompt of [buildDebugPrompt({evidence:enriched,gitContext}),buildCausalVerificationPrompt({evidence:enriched,gitContext,investigation})]){
      assert.doesNotMatch(prompt,/(?:sarif|uri|junit|source|history|candidate|commit|draft|patch)Canary123456789/);
      assert.match(prompt,/REDACTED/);
    }
    assert.doesNotMatch(JSON.stringify(evidence.artifacts),/(?:sarif|uri|junit)Canary123456789/);
    assert.equal(investigation.patch.unifiedDiff,'api_key=patchCanary123456789','local proposed bytes must not be silently rewritten');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('explicit external evidence remains supported with bounded descriptor reads',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debug-explicit-input-'));
  try{
    const file=path.join(dir,'failure.log');fs.writeFileSync(file,'fatal error: bounded');
    assert.equal(readBoundedFile(file,100),'fatal error: bounded');
    assert.throws(()=>readBoundedFile(file,4),/exceeds/);
    assert.equal(loadArtifacts([`text:${file}`],{workspace:os.tmpdir(),maxBytes:100}).length,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('evidence cannot exceed its limit by growing after the descriptor was opened',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debug-growing-input-')),file=path.join(dir,'growing.log');
  fs.writeFileSync(file,'x');const original=fs.readSync;let grown=false;
  try{
    fs.readSync=function(fd,...args){if(!grown){grown=true;fs.appendFileSync(file,'y'.repeat(100));}return original.call(this,fd,...args);};
    assert.throws(()=>readBoundedFile(file,8),/exceeds|changed/);
  }finally{fs.readSync=original;fs.rmSync(dir,{recursive:true,force:true});}
});

test('stored sessions enforce a bounded read and reject link swaps after the initial check',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debug-session-read-')),sessionId='dbg-'+'a'.repeat(16);
  try{
    const file=writeSession(dir,{sessionId,value:'safe'}),original=fs.openSync,external=path.join(dir,'external.json');fs.writeFileSync(external,'{"value":"external"}');let swapped=false;
    fs.openSync=function(target,...args){if(target===file&&!swapped){swapped=true;fs.unlinkSync(file);fs.linkSync(external,file);}return original.call(this,target,...args);};
    try{assert.throws(()=>readSession(dir,sessionId),/single|link/);}finally{fs.openSync=original;}
    fs.unlinkSync(file);fs.writeFileSync(file,'x'.repeat(16*1024*1024+1));
    assert.throws(()=>readSession(dir,sessionId),/exceeds/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});



test('artifact fields redact before truncation and cap SARIF results across runs',()=>{
  const {parseSarif}=require('../src/artifacts');
  const secret='ghp_'+'A'.repeat(36),message='x'.repeat(485)+' '+secret;
  const parsed=parseSarif(Buffer.from(JSON.stringify({runs:[{results:Array.from({length:60},()=>({message:{text:message}}))},{results:Array.from({length:60},()=>({message:{text:'later'}}))}]})));
  assert.equal(parsed.results.length,80);assert.doesNotMatch(parsed.results[0].message,/ghp_/);assert.ok(Buffer.byteLength(parsed.results[0].message)<=500);
  const unicode=parseSarif(Buffer.from(JSON.stringify({runs:[{results:[{message:{text:'界'.repeat(500)}}]}]})));
  assert.ok(Buffer.byteLength(unicode.results[0].message)<=500);assert.doesNotMatch(unicode.results[0].message,/\uFFFD/);
});

test('System.map parsing and digest use one bounded descriptor read',()=>{
  const {resolveKernelSystemMap,sha256File}=require('../src/platform-symbols'),crypto=require('node:crypto');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'debug-map-identity-')),file=path.join(root,'System.map'),bytes=Buffer.from('ffffffff81000000 T start_kernel\nffffffff81001000 T do_fault\n');
  fs.writeFileSync(file,bytes);const realFile=fs.realpathSync(file),original=fs.openSync;let opened=0;
  try{
    fs.openSync=function(target,...args){if(target===realFile)opened++;return original.call(this,target,...args);};
    const result=resolveKernelSystemMap({kernel:{pcAddress:'ffffffff81001000',callTrace:[]},systemMapFile:file,kernelKaslrSlide:'0x0'});
    assert.equal(result.pc.symbol,'do_fault');assert.equal(result.systemMap.fileDigest,crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(result.systemMap.size,bytes.length);assert.equal(opened,1);
    assert.throws(()=>sha256File(file,{maxBytes:4}),/exceeds/);
  }finally{fs.openSync=original;fs.rmSync(root,{recursive:true,force:true});}
});


test('signals, frame display text and commit subjects redact before their length limits',()=>{
 const {parseLog}=require('../src/git-causality'),{extractSignals,extractFrames}=require('../src/parsers'),{safeSourceLabel}=require('../src/evidence'),secret='ghp_'+'B'.repeat(36);
 assert.doesNotMatch(parseLog('a'.repeat(40)+'\t2026-01-01\t'+'x'.repeat(285)+' '+secret,'file')[0].subject,/ghp_/);
 assert.doesNotMatch(extractSignals('FATAL '+ 'x'.repeat(680)+' '+secret)[0],/ghp_/);
 assert.doesNotMatch(extractFrames('src/main.c:1 '+ 'x'.repeat(470)+' '+secret)[0].raw,/ghp_/);
 assert.doesNotMatch(safeSourceLabel('x'.repeat(500)+' '+secret,os.tmpdir()),/ghp_/);
});
