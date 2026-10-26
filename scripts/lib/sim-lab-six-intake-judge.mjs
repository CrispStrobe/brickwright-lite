// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {evaluateRodRatio} from './sim-lab-rod-ratio-judge.mjs';
import {evaluateVernierDrive} from './sim-lab-vernier-drive-judge.mjs';
import {evaluateLineTurner} from './sim-lab-line-turner-judge.mjs';
import {judgeJansen} from '../../test/fixtures/model-files/dune-strider-source/tools/judge-native.mjs';
import {judgeAtlas} from '../../test/fixtures/model-files/atlas-six-source/tools/judge-native.mjs';
import {judgeNative as judgeOblique} from './sim-lab-oblique-native-judge.mjs';
import {reviewedIntakeContract,intakeHash} from './sim-lab-six-intake-contracts.mjs';

export async function evaluateReviewedIntake(id,record,{native=true,contract=reviewedIntakeContract(id,{frameMs:record.timing?.frameMs})}={}){
 if(id==='rod-ratio')return evaluateRodRatio(record,{native});
 if(id==='vernier-drive')return evaluateVernierDrive(record,{native});
 if(id==='line-turner')return evaluateLineTurner(record,{native});
 assert.ok(native,'Browser observations need the separately scoped mechanical observer');
 const result=id==='dune-strider'?judgeJansen(record,contract,{includeSamples:false}):id==='atlas-six'?judgeAtlas(record,contract,{includeSamples:false}):judgeOblique(record,contract,{contractSha256:intakeHash(JSON.stringify(contract))});
 return {...result,failures:result.gates.filter(g=>g.status==='FAIL')};
}
export async function judgeReviewedIntake(id,record,options){
 const result=await evaluateReviewedIntake(id,record,options);assert.deepEqual(result.failures,[],'Complete original '+id+' physical acceptance');
 return result.metrics||result.measurements;
}
