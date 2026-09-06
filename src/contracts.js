'use strict';
const crypto=require('node:crypto');
const DEBUG_CONTRACT_VERSION=1,DEBUG_EVIDENCE_VERSION=1,DEBUG_RECEIPT_VERSION=1,HYPOTHESIS_LEDGER_VERSION=1;
const FAILURE_KINDS=Object.freeze(['build','test','crash','sanitizer','race','deadlock','oom','watchdog','kernel','android','mcu','audio','performance','dependency','infra','unknown']);
const HYPOTHESIS_STATUSES=Object.freeze(['open','supported','refuted','confirmed']);
const FIX_STATUSES=Object.freeze(['unresolved','diagnosed','proposed','applied-unverified','verified','regressed']);
const ISO_UTC_TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function freeze(value){if(Array.isArray(value))return Object.freeze(value.map(freeze));if(value&&typeof value==='object')return Object.freeze(Object.fromEntries(Object.entries(value).map(([k,v])=>[k,freeze(v)])));return value;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>[k,stable(value[k])]));return value;}
function stableDigest(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function makeSessionId(evidenceDigest,createdAt=new Date().toISOString(),nonce=crypto.randomBytes(16).toString('hex')){return `dbg-${stableDigest({evidenceDigest:String(evidenceDigest||''),createdAt:String(createdAt),nonce:String(nonce)}).slice(0,16)}`;}
function normalizeStrings(value,max=20,length=1000){return Object.freeze((Array.isArray(value)?value:[]).map(v=>String(v||'').trim().slice(0,length)).filter(Boolean).slice(0,max));}
function computeInvestigationDigest(investigation){return stableDigest({rootCause:investigation?.rootCause||'',confidence:Number(investigation?.confidence||0),hypotheses:investigation?.hypotheses||[],patch:investigation?.patch||null,verificationPlan:investigation?.verificationPlan||[],causalVerification:investigation?.causalVerification||null});}
function hasAuthorizedPatch(investigation){if(!investigation?.patch)return true;const cv=investigation.causalVerification;return Boolean(cv&&cv.rootCauseAssessment==='supported'&&cv.patchDisposition==='accept');}

function validateReceipt(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('Debug Receipt must be an object.'),{code:'EDEBUGRECEIPT'});
  if(value.schemaVersion!==DEBUG_RECEIPT_VERSION||value.kind!=='codex-debug')throw Object.assign(new Error('Unsupported Debug Receipt version/kind.'),{code:'EDEBUGRECEIPT'});
  for(const key of ['evidenceDigest','investigationDigest','ledgerDigest','verificationDigest','patchStateDigest','lineageDigest','debugFingerprint','receiptDigest'])if(!/^[0-9a-f]{64}$/.test(String(value[key]||'')))throw Object.assign(new Error(`Invalid ${key}.`),{code:'EDEBUGRECEIPT'});
  if(!FIX_STATUSES.includes(value.fixStatus))throw Object.assign(new Error('Invalid fixStatus.'),{code:'EDEBUGRECEIPT'});
  if(!/^dbg-[0-9a-f]{16}$/.test(String(value.sessionId||'')))throw Object.assign(new Error('Invalid sessionId.'),{code:'EDEBUGRECEIPT'});
  if(typeof value.createdAt!=='string'||!ISO_UTC_TIMESTAMP.test(value.createdAt)||Number.isNaN(Date.parse(value.createdAt))||new Date(value.createdAt).toISOString()!==value.createdAt)throw Object.assign(new Error('Debug Receipt createdAt must be canonical UTC ISO-8601.'),{code:'EDEBUGRECEIPT'});
  const copy={...value};delete copy.receiptDigest;
  if(stableDigest(copy)!==value.receiptDigest)throw Object.assign(new Error('Debug Receipt digest mismatch.'),{code:'EDEBUGRECEIPTDIGEST'});
  return freeze(value);
}

function validateRollbackBinding(session){
  if(!session?.patch?.rolledBack)return true;
  const rollback=session.lineage?.rollback;
  if(session.patch.applied!==false||!rollback||rollback.kind!=='workspace-rollback')throw Object.assign(new Error('Stored rollback session has inconsistent patch/lineage state.'),{code:'EDEBUGROLLBACKBINDING'});
  if(!/^snap-[0-9a-f]{16}$/.test(String(rollback.snapshotId||''))||rollback.snapshotId!==session.patch.snapshotId||rollback.snapshotId!==session.patch.rollbackSnapshotId)throw Object.assign(new Error('Stored rollback session snapshot binding is inconsistent.'),{code:'EDEBUGROLLBACKBINDING'});
  if(!/^[0-9a-f]{64}$/.test(String(rollback.rollbackDigest||''))||rollback.rollbackDigest!==session.patch.rollbackDigest||rollback.rollbackDigest!==session.verification?.rollbackDigest)throw Object.assign(new Error('Stored rollback session digest binding is inconsistent.'),{code:'EDEBUGROLLBACKBINDING'});
  if(session.verification?.rollbackObserved!==true||session.verification?.rollbackSnapshotId!==rollback.snapshotId||String(session.verification?.rollbackStateFingerprint||'')!==String(rollback.afterStateFingerprint||''))throw Object.assign(new Error('Stored rollback session verification binding is inconsistent.'),{code:'EDEBUGROLLBACKBINDING'});
  if(stableDigest(session.patch.rollbackPaths||[])!==stableDigest(rollback.paths||[]))throw Object.assign(new Error('Stored rollback session path binding is inconsistent.'),{code:'EDEBUGROLLBACKBINDING'});
  if(!session.lineage?.parentSessionId||!session.lineage?.parentDebugFingerprint||!session.lineage?.rolledBackAt)throw Object.assign(new Error('Stored rollback session lineage is incomplete.'),{code:'EDEBUGROLLBACKBINDING'});
  if(session.fixStatus==='verified'||session.fixStatus==='applied-unverified')throw Object.assign(new Error('A completed rollback cannot retain an applied/verified fix status.'),{code:'EDEBUGROLLBACKBINDING'});
  return true;
}

function validateStoredSession(session){
  if(!session||typeof session!=='object'||Array.isArray(session))throw Object.assign(new Error('Stored Debug session is invalid.'),{code:'EDEBUGSESSION'});
  const receipt=validateReceipt(session.receipt);
  if(receipt.sessionId!==session.sessionId||receipt.evidenceDigest!==session.evidence?.digest||receipt.investigationDigest!==computeInvestigationDigest(session.investigation)||receipt.ledgerDigest!==stableDigest(session.ledger||{})||receipt.verificationDigest!==stableDigest(session.verification||{})||receipt.patchStateDigest!==stableDigest(session.patch||{})||receipt.lineageDigest!==stableDigest(session.lineage||{}))throw Object.assign(new Error('Stored Debug session binding is stale or modified.'),{code:'EDEBUGSESSIONBINDING'});
  if(!hasAuthorizedPatch(session.investigation))throw Object.assign(new Error('Stored Debug session contains a patch without supported causal-verifier authorization.'),{code:'EDEBUGPATCHAUTH'});
  validateRollbackBinding(session);
  return freeze(session);
}

function createDebugReceipt({sessionId,evidence,investigation,ledger,verification,patchResult=null,lineage=null,fixStatus,model='',codexVersion='',createdAt=new Date().toISOString()}={}){
  if(!evidence?.digest)throw new Error('Debug Receipt requires evidence.');
  const investigationDigest=computeInvestigationDigest(investigation),ledgerDigest=stableDigest(ledger||{}),verificationDigest=stableDigest(verification||{}),patchStateDigest=stableDigest(patchResult||{}),lineageDigest=stableDigest(lineage||{}),subject={commitSha:String(evidence.git?.head||''),workspaceId:String(evidence.workspaceId||''),source:String(evidence.source?.label||'')},normalizedFix=FIX_STATUSES.includes(fixStatus)?fixStatus:'unresolved',canonicalCreatedAt=new Date(createdAt).toISOString(),debugFingerprint=stableDigest({subject,evidenceDigest:evidence.digest,investigationDigest,ledgerDigest,verificationDigest,patchStateDigest,lineageDigest,fixStatus:normalizedFix,model:String(model||''),codexVersion:String(codexVersion||'')});
  const base={schemaVersion:DEBUG_RECEIPT_VERSION,kind:'codex-debug',sessionId:String(sessionId),subject,evidenceDigest:evidence.digest,investigationDigest,ledgerDigest,verificationDigest,patchStateDigest,lineageDigest,fixStatus:normalizedFix,model:String(model||''),codexVersion:String(codexVersion||''),debugFingerprint,createdAt:canonicalCreatedAt};
  return validateReceipt({...base,receiptDigest:stableDigest(base)});
}

module.exports=Object.freeze({DEBUG_CONTRACT_VERSION,DEBUG_EVIDENCE_VERSION,DEBUG_RECEIPT_VERSION,HYPOTHESIS_LEDGER_VERSION,FAILURE_KINDS,HYPOTHESIS_STATUSES,FIX_STATUSES,ISO_UTC_TIMESTAMP,freeze,stableDigest,makeSessionId,normalizeStrings,computeInvestigationDigest,hasAuthorizedPatch,createDebugReceipt,validateReceipt,validateRollbackBinding,validateStoredSession});
