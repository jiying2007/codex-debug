'use strict';

const {freeze}=require('./contracts');
const PATTERNS=Object.freeze({
  sanitizer:/(?:AddressSanitizer|ThreadSanitizer|UndefinedBehaviorSanitizer|LeakSanitizer|MemorySanitizer|Valgrind)/i,
  kernel:/(?:kernel panic|\bBUG:|\bOops:|Call Trace:|watchdog:|soft lockup|hard LOCKUP|rcu_sched detected stalls)/i,
  android:/(?:FATAL EXCEPTION|AndroidRuntime|ANR in |ActivityManager: ANR|tombstone|DEBUG\s*:\s*backtrace)/i,
  mcu:/(?:HardFault|MemManage|BusFault|UsageFault|\bCFSR\b|\bHFSR\b|\bBFAR\b|\bMMFAR\b|\bPC\s*[:=]\s*0x[0-9a-f]+|\bLR\s*[:=]\s*0x[0-9a-f]+)/i,
  crash:/(?:segmentation fault|SIGSEGV|SIGABRT|access violation|core dumped|uncaught exception|\bpanic:)/i,
  performance:/(?:performance regression|latency regression|\btimeout\b|deadline missed|\bjank\b|slow frame|cpu regression|memory regression)/i,
  test:/(?:tests? failed|\bFAILURES?\b|AssertionError|expected .* received|\bpytest\b|\bjunit\b|\bgtest\b|\bctest\b|\bjest\b)/i,
  build:/(?:compilation terminated|undefined reference|linker command failed|fatal error:|error C\d{4}|cannot find symbol|BUILD FAILED)/i,
  dependency:/(?:could not resolve|\bdependency\b|package .* not found|npm ERR!|No matching distribution found|artifact .* not found)/i,
  infra:/(?:no space left|network is unreachable|temporary failure in name resolution|connection reset|permission denied|out of memory|OOMKilled|runner lost|executor failed)/i
});
function detectFailureKind(text,requested='auto'){if(requested&&requested!=='auto')return requested;const s=String(text||'');for(const kind of ['sanitizer','kernel','android','mcu','crash','test','build','dependency','infra','performance'])if(PATTERNS[kind].test(s))return kind;return 'unknown';}
function extractFrames(text,max=40){const frames=[],seen=new Set();const lines=String(text||'').split(/\r?\n/);const regexes=[
  /(?:at\s+)?([^\s()]+)\s*\(([^():]+):(\d+)(?::\d+)?\)/,
  /\s+at\s+([\w.$<>]+)\(([^:()]+):(\d+)\)/,
  /#\d+\s+(?:0x[0-9a-f]+\s+in\s+)?([^\s]+).*?\s(?:at|from)\s+([^: ]+):(\d+)/i,
  /([^\s:]+\.(?:c|cc|cpp|cxx|h|hpp|rs|go|py|js|jsx|ts|tsx|java|kt|swift)):(\d+)(?::\d+)?/
];
  for(let i=0;i<lines.length&&frames.length<max;i++){const line=lines[i];for(const re of regexes){const m=line.match(re);if(!m)continue;let symbol='',file='',lineNo=0;if(m.length>=4){symbol=m[1]||'';file=m[2]||'';lineNo=Number(m[3]||0);}else{file=m[1]||'';lineNo=Number(m[2]||0);}const key=`${file}:${lineNo}:${symbol}`;if(file&&!seen.has(key)){seen.add(key);frames.push({file,line:lineNo,symbol,raw:line.trim().slice(0,500)});}break;}}
  return freeze(frames);
}
function extractSignals(text,max=30){const out=[],seen=new Set();for(const raw of String(text||'').split(/\r?\n/)){const line=raw.trim();if(!line)continue;if(/(?:ERROR:|FATAL|panic|Assertion|assertion|race on|heap-use-after-free|stack-buffer-overflow|data race|undefined reference|HardFault|BusFault|UsageFault|ANR|SIGSEGV|SIGABRT|watchdog|OOM|out of memory)/i.test(line)){const normalized=line.replace(/0x[0-9a-f]+/ig,'0xADDR').replace(/\b\d{4,}\b/g,'N');if(!seen.has(normalized)){seen.add(normalized);out.push(line.slice(0,700));if(out.length>=max)break;}}}return freeze(out);}
function parseFailure(text,{kind='auto'}={}){const detectedKind=detectFailureKind(text,kind);const sanitizer=(String(text||'').match(PATTERNS.sanitizer)||[])[0]||'';return freeze({kind:detectedKind,sanitizer,frames:extractFrames(text),signals:extractSignals(text)});}
module.exports={PATTERNS,detectFailureKind,extractFrames,extractSignals,parseFailure};
