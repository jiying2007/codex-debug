'use strict';

const fs=require('node:fs');
const path=require('node:path');
function sessionDirectory(workspace){return path.join(workspace,'.codex-debug','sessions');}
function writeSession(workspace,session){const dir=sessionDirectory(workspace);fs.mkdirSync(dir,{recursive:true,mode:0o700});const target=path.join(dir,`${session.sessionId}.json`),temp=`${target}.${process.pid}.tmp`;fs.writeFileSync(temp,`${JSON.stringify(session,null,2)}\n`,{encoding:'utf8',mode:0o600});fs.renameSync(temp,target);return target;}
function readSession(workspace,sessionId){const file=path.join(sessionDirectory(workspace),`${String(sessionId)}.json`);return JSON.parse(fs.readFileSync(file,'utf8'));}
module.exports={sessionDirectory,writeSession,readSession};
