'use strict';

const {secureReadBuffer}=require('./codex-safe-core/secure-local-file');
const {resolveFrameFile}=require('./source-context');
const {execFileSync}=require('node:child_process');
const {buildTestImpactMap}=require('./codex-safe-core/test-impact');
const {freeze}=require('./contracts');
function gitFiles(root){try{return execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:4*1024*1024,timeout:30000}).split('\0').filter(Boolean);}catch{return [];}}
function isTestPath(file){return /(?:^|\/)(?:test|tests|__tests__)\/|(?:^|\/)[^/]+(?:\.test|\.spec|_test|test_)[^/]*\.(?:js|jsx|ts|tsx|c|cc|cpp|cxx|py|go|rs|java|kt)$/i.test(String(file||''));}
function readCandidate(root,file,maxBytes=64*1024){try{const resolved=resolveFrameFile(root,file);if(!resolved)return '';const buffer=secureReadBuffer(resolved.absolute,{maxBytes,requireOwner:false,rejectGroupOtherWrite:false}),rebound=resolveFrameFile(root,file);if(!rebound||rebound.absolute!==resolved.absolute)return '';return buffer.includes(0)?'':buffer.toString('utf8');}catch{return '';}}
function selectRegressionTests(root,{changedPaths=[],sourceContext=[],maxTests=20,maxCandidates=200}={}){if(!root)return freeze({version:1,changedPaths:[],recommendedTests:[],candidateCount:0,truncated:false,digest:''});const related=[...new Set([...(changedPaths||[]),...(sourceContext||[]).map(v=>v.file)].filter(Boolean))],candidates=gitFiles(root).filter(isTestPath).slice(0,maxCandidates).map(file=>({path:file,content:readCandidate(root,file)}));return buildTestImpactMap({changedPaths:related,candidates,maxTests,minScore:1});}
module.exports={gitFiles,isTestPath,readCandidate,selectRegressionTests};
