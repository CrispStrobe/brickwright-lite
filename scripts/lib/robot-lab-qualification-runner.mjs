// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
const COMMON=['catalogue','lessons-generated','registrations-lessons-search','construction','native-motion-and-negatives','mirrors'];
export const qualificationStageIds=mode=>mode==='native'?[...COMMON,'candidate-identity']:mode==='full'?[...COMMON,'production-build','chromium','webkit','export','candidate-identity']:[];
export async function executeQualification(plan,{directory,execute,identity,requiredIdentity=identity,mode='full'}){
 mkdirSync(dirname(directory),{recursive:true});mkdirSync(directory,{recursive:false});
 const receipt={version:1,mode,status:'RUNNING',admitted:false,identity,startedAt:new Date().toISOString(),steps:[]};
 const save=()=>writeFileSync(join(directory,'qualification.json'),JSON.stringify(receipt,null,2)+'\n');save();
 try{
  const required=qualificationStageIds(mode);
  if(!required.length||JSON.stringify(plan.map(s=>s.id))!==JSON.stringify(required))throw Error('Incomplete or altered qualification plan');
  if(identity!==requiredIdentity)throw Error('Candidate identity changed before qualification');
  for(const step of plan){
   const record={id:step.id,status:'RUNNING',startedAt:new Date().toISOString()};receipt.steps.push(record);save();
   const result=await execute(step,directory);record.exitCode=result.code;record.finishedAt=new Date().toISOString();record.log=result.log;
   record.status=result.code===0?'PASS':'FAIL';save();if(result.code!==0)throw Error('Qualification stopped: '+step.id);
  }
  receipt.status=mode==='full'?'PASS':'PARTIAL';receipt.admitted=mode==='full';
 }catch(error){receipt.status='FAIL';receipt.error=error.message;}
 receipt.finishedAt=new Date().toISOString();save();return receipt;
}
