#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const root=path.resolve(process.argv[2]||'.github/workflows');
function walk(p){if(!fs.existsSync(p))return[];const s=fs.lstatSync(p);if(s.isSymbolicLink())throw new Error(`workflow path must not traverse symlink: ${p}`);if(s.isFile())return[p];return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>walk(path.join(p,e.name)));}
let checked=0;const refs=[];for(const file of walk(root).filter(f=>/\.ya?ml$/i.test(f))){const text=fs.readFileSync(file,'utf8');for(const match of text.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+).*$/gm)){const ref=match[1];if(ref.startsWith('./'))continue;checked++;refs.push({file:path.relative(process.cwd(),file).replace(/\\/g,'/'),ref});const at=ref.lastIndexOf('@'),version=at>=0?ref.slice(at+1):'';if(!/^[0-9a-f]{40}$/i.test(version))throw new Error(`${path.relative(process.cwd(),file)} contains unpinned action/reusable workflow: ${ref}`);}}
if(checked===0)throw new Error(`workflow pin gate scanned zero external action references under ${path.relative(process.cwd(),root)||'.'}`);process.stdout.write(`${JSON.stringify({checked,refs})}\n`);
