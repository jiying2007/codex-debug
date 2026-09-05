#!/usr/bin/env node
'use strict';
const {parseArgs,help}=require('./args');
const {runDebugSession}=require('./debug');
async function readStdin(){if(process.stdin.isTTY)return '';const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);return Buffer.concat(chunks.map(c=>Buffer.isBuffer(c)?c:Buffer.from(c))).toString('utf8');}
async function main(){const options=parseArgs(process.argv.slice(2));if(options.help){process.stdout.write(help());return;}if(!options.logFile&&!options.command)options.text=await readStdin();if(!options.logFile&&!options.command&&!String(options.text||'').trim()&&!options.artifacts.length)throw new Error('Provide --log, --command, --artifact, or pipe failure evidence on stdin.');const result=await runDebugSession(options);process.stdout.write(`${JSON.stringify({sessionId:result.sessionId,fixStatus:result.fixStatus,failureKind:result.evidence.kind,rootCause:result.investigation.rootCause,confidence:result.investigation.confidence,patch:result.patch,verification:result.verification,sessionPath:result.sessionPath||'',receipt:result.receipt},null,2)}\n`);}
if(require.main===module)main().catch(error=>{process.stderr.write(`Codex Debug Safe failed: ${error.message}\n`);process.exitCode=2;});
module.exports={main,readStdin};
