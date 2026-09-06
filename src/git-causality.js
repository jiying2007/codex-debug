'use strict';

const {execFileSync}=require('node:child_process');
const {freeze,stableDigest}=require('./contracts');
function git(args,cwd){try{return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:2*1024*1024}).trim();}catch{return '';}}
function parseLog(raw,file){return String(raw||'').split(/\r?\n/).filter(Boolean).map((line,index)=>{const [sha,date,...subject]=line.split('\t');return {sha,date,subject:subject.join('\t').slice(0,300),file,order:index};}).filter(x=>/^[0-9a-f]{40}$/.test(x.sha));}
function rankCausalCommits(root,sourceContext,{perFile=12,maxCandidates=24}={}){if(!root)return freeze({candidates:[],digest:stableDigest([])});const bySha=new Map();for(const anchor of (sourceContext||[]).slice(0,12)){const raw=git(['log','-n',String(perFile),'--date=iso-strict','--pretty=format:%H%x09%ad%x09%s','--',anchor.file],root);for(const row of parseLog(raw,anchor.file)){const prior=bySha.get(row.sha)||{sha:row.sha,date:row.date,subject:row.subject,files:new Set(),score:0,reasons:[]};prior.files.add(anchor.file);const recency=Math.max(1,12-row.order);prior.score+=30+recency;prior.reasons.push(`touches-stack-anchor:${anchor.file}`);if(anchor.blame&&anchor.blame.startsWith(row.sha)) {prior.score+=80;prior.reasons.push(`blame-anchor:${anchor.file}:${anchor.line}`);}bySha.set(row.sha,prior);}}
const candidates=[...bySha.values()].map(v=>({sha:v.sha,date:v.date,subject:v.subject,files:[...v.files].sort(),score:v.score,reasons:[...new Set(v.reasons)]})).sort((a,b)=>b.score-a.score||String(b.date).localeCompare(String(a.date))||a.sha.localeCompare(b.sha)).slice(0,maxCandidates);return freeze({candidates,digest:stableDigest(candidates)});}
module.exports={parseLog,rankCausalCommits};
