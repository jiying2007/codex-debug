'use strict';

function bullets(items,fallback='- none') {
  return items&&items.length?items.map(x=>`- ${x}`).join('\n'):fallback;
}

function rootCausePresentation(investigation={}) {
  const assessment=investigation.causalVerification?.rootCauseAssessment||'not-run';
  if(assessment==='supported')return {heading:'## Supported root cause',note:'The causal verifier supports this mechanism. Runtime fix verification is reported separately below.'};
  if(assessment==='contradicted')return {heading:'## Refuted root-cause candidate',note:'The second-pass causal verifier contradicted the draft mechanism; treat the text below only as the rejected draft candidate.'};
  if(assessment==='insufficient')return {heading:'## Unresolved root-cause candidate',note:'The second-pass causal verifier found insufficient evidence; this is not an established root cause.'};
  return {heading:'## Root-cause candidate',note:'No causal-verifier support is available; this is a hypothesis, not an established root cause.'};
}

function embeddedSymbolRows(value) {
  if(!value)return [];
  const out=[];
  for(const row of value.resolutions||[]) {
    if(row.source==='map'&&row.resolution)out.push(`${row.register.toUpperCase()} ${row.hex} -> ${row.resolution.name}+0x${row.resolution.offset.toString(16)} (map)`);
    else if(row.source==='elf')out.push(`${row.register.toUpperCase()} ${row.hex} -> ${row.function||'??'} ${row.location||''} (${value.elf?.tool||'addr2line'})`.trim());
  }
  if(value.map)out.push(`map=${value.map.name} symbols=${value.map.symbolCount??0} digest=${value.map.digest||''}`);
  if(value.elf)out.push(`elf=${value.elf.name} tool=${value.elf.tool} exit=${value.elf.exitCode} outputDigest=${value.elf.outputDigest||''}`);
  return out;
}

function platformSymbolRows(value) {
  if(!value)return [];
  const out=[];

  for(const row of value.android?.resolutions||[]) {
    const build=row.expectedBuildId?` buildId=${row.buildIdMatch===true?'match':row.status}`:'';
    const resolved=row.status==='resolved'?` -> ${row.function||'??'} ${row.location||''}`:'';
    out.push(`Android #${row.frameIndex} ${row.moduleBase||row.module||''} pc=${row.pc||''}${build} status=${row.status}${resolved}`.trim());
  }
  if(value.android?.symbolFiles?.length) {
    for(const file of value.android.symbolFiles)out.push(`Android symbols ${file.moduleBase||file.module}: ${file.fileName} digest=${file.fileDigest}`);
  }

  if(value.kernel) {
    const k=value.kernel,kaslr=k.kaslr||{};
    out.push(`Kernel KASLR status=${kaslr.status||'unproven'} source=${kaslr.source||'none'} slide=${kaslr.slide||'unknown'}${kaslr.logBase?` logBase=${kaslr.logBase}`:''}`);
    if(k.pc)out.push(`Kernel PC runtime=${k.pc.runtimeAddress||''} link=${k.pc.linkAddress||k.pc.address||''} -> ${k.pc.symbol}+${k.pc.offsetHex}`);
    else if(k.pcStatus)out.push(`Kernel PC status=${k.pcStatus}`);
    for(const row of k.frames||[]) {
      if(row.resolution)out.push(`Kernel runtime=${row.runtimeAddress||row.address||''} link=${row.linkAddress||''} -> ${row.resolution.symbol}+${row.resolution.offsetHex}`);
      else out.push(`Kernel runtime=${row.runtimeAddress||row.address||'n/a'} ${row.symbolFromLog||''} status=${row.status}`.trim());
    }
    if(k.systemMap)out.push(`System.map=${k.systemMap.name} symbols=${k.systemMap.symbolCount} digest=${k.systemMap.fileDigest}`);
  }

  for(const row of value.kernelModules?.resolutions||[]) {
    const identity=row.expectedBuildId?` buildId=${row.buildIdMatch===true?'match':row.status}`:' buildId=missing';
    const resolved=row.status==='resolved'?` -> ${row.function||row.symbol||'??'} ${row.location||''}`:'';
    out.push(`Kernel module ${row.module||''} ${row.symbol||''}+${row.symbolOffsetHex||'0x0'}${identity} status=${row.status}${resolved}`.trim());
  }
  if(value.kernelModules?.symbolFiles?.length) {
    for(const file of value.kernelModules.symbolFiles)out.push(`Kernel module symbols ${file.module}: ${file.fileName} digest=${file.fileDigest}`);
  }

  return out;
}

function formatDebugReport(result) {
  const i=result.investigation||{},e=result.evidence||{},v=result.verification||{},ledger=result.ledger||{entries:[]},cv=i.causalVerification||{},bis=e.bisect||{},tests=e.regressionTests?.recommendedTests||[],root=rootCausePresentation(i),platform=e.parsed?.platform||{},transition=v.failureTransition?.status||'not-run';
  const rows=ledger.entries.map(h=>`| ${h.id} | ${h.status} | ${String(h.title||'').replace(/\|/g,'\\|')} |`).join('\n');
  return ['# Codex Debug Safe Report','',`**Session:** ${result.sessionId}`,result.lineage?.parentSessionId?`**Parent session:** ${result.lineage.parentSessionId}`:'',`**Fix status:** ${result.fixStatus}`,`**Failure kind:** ${e.kind||'unknown'}`,`**Hypothesis confidence:** ${Math.round(Number(i.confidence||0)*100)}%`,`**Causal verifier:** ${cv.rootCauseAssessment||'not-run'}${Number.isFinite(cv.confidence)?` (${Math.round(cv.confidence*100)}%)`:''}`,`**HEAD:** ${e.git?.head||'n/a'}`,result.patch?.snapshotId?`**Rollback snapshot:** ${result.patch.snapshotId}`:'','',root.heading,'',root.note,'',i.rootCause||'Unresolved.','','## Hypothesis ledger','', '| ID | Status | Hypothesis |','|---|---|---|',rows||'| - | open | No model hypotheses |','','## Primary signals','',bullets(e.parsed?.signals||[]),'','## Platform evidence','',bullets([platform.android?`Android: ${JSON.stringify(platform.android)}`:'',platform.kernel?`Kernel: ${JSON.stringify(platform.kernel)}`:'',platform.rtos?`RTOS: ${JSON.stringify(platform.rtos)}`:''].filter(Boolean)),'','## Platform symbols','',bullets(platformSymbolRows(e.platformSymbols)),'','## Embedded symbols','',bullets(embeddedSymbolRows(e.embeddedSymbols)),'','## Source anchors','',bullets((e.sourceContext||[]).map(s=>`${s.file}:${s.line}${s.blame?` — blame ${s.blame.split(' ')[0]}`:''}`)),'','## Core / symbolization','',e.symbolization?`- ${e.symbolization.tool}; core=${e.symbolization.core?.name}; executable=${e.symbolization.executable?.name}; truncated=${e.symbolization.truncated?'yes':'no'}; outputDigest=${e.symbolization.outputDigest}`:'- not supplied','','## Safe bisect','',bis.status?`- status=${bis.status}; firstBad=${bis.firstBad||'unproven'}; tested=${bis.tested?.length||0}; reason=${bis.reason||''}`:'- not run','','## Causal commit candidates','',bullets((e.causalHistory?.candidates||[]).slice(0,10).map(c=>`${c.sha.slice(0,12)} score=${c.score} ${c.files.join(', ')} — candidate only`)),'','## Regression-test candidates','',bullets(tests.slice(0,20).map(t=>`${t.path} score=${t.score} reasons=${(t.reasons||[]).join(',')}`)),'','## Evidence artifacts','',bullets((e.artifacts||[]).map(a=>`${a.kind}:${a.name} digest=${a.digest}`)),'','## Coverage gaps','',bullets(i.coverageGaps||[]),'','## Proposed patch','',i.patch?`${i.patch.summary}\n\nRisk: **${i.patch.risk}**\n\n\`\`\`diff\n${i.patch.unifiedDiff}\n\`\`\``:'No verifier-accepted patch proposed.','','## Verification plan','',bullets(i.verificationPlan||[]),'','## Runtime verification','',`Baseline: ${v.baselineSummary?`${v.baselineSummary.failures}/${v.baselineSummary.runs} failed`:'not observed'}`,`Mutation observed: ${v.mutationObserved?'yes':'no'}`,`After: ${v.afterSummary?`${v.afterSummary.passes}/${v.afterSummary.runs} passed`:'not run'}`,`Failure transition: ${transition}`,`Result: ${v.status||'not-run'}`,'',`Evidence digest: \`${e.digest||''}\``,`Patch-state digest: \`${result.receipt?.patchStateDigest||''}\``,`Receipt fingerprint: \`${result.receipt?.debugFingerprint||''}\``].filter(Boolean).join('\n');
}

module.exports={bullets,rootCausePresentation,embeddedSymbolRows,platformSymbolRows,formatDebugReport};
