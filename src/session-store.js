'use strict';

const fs=require('node:fs');
const path=require('node:path');
function sessionDirectory(workspace){return path.join(workspace,'.codex-debug','sessions');}
function safeSessionId(value){const id=String(value||'');if(!/^dbg-[0-9a-f]{16}$/.test(id))throw Object.assign(new Error('Invalid Debug session id.'),{code:'ESESSIONID'});return id;}
function writeSession(workspace,session){const dir=sessionDirectory(workspace);fs.mkdirSync(dir,{recursive:true,mode:0o700});const target=path.join(dir,`${safeSessionId(session.sessionId)}.json`),temp=`${target}.${process.pid}.tmp`;fs.writeFileSync(temp,`${JSON.stringify(session,null,2)}\n`,{encoding:'utf8',mode:0o600});fs.renameSync(temp,target);return target;}
function readSession(workspace,sessionId){const file=path.join(sessionDirectory(workspace),`${safeSessionId(sessionId)}.json`);return JSON.parse(fs.readFileSync(file,'utf8'));}
function listSessions(workspace,{max=50}={}){const dir=sessionDirectory(workspace);try{return fs.readdirSync(dir).filter(v=>/^dbg-[0-9a-f]{16}\.json$/.test(v)).map(v=>{const stat=fs.statSync(path.join(dir,v));return {sessionId:v.slice(0,-5),mtimeMs:stat.mtimeMs};}).sort((a,b)=>b.mtimeMs-a.mtimeMs).slice(0,max);}catch{return [];}}
module.exports={sessionDirectory,safeSessionId,writeSession,readSession,listSessions};
