// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {curatedStockAudit} from './sim-lab-curated-stock-audit.mjs';
import {adaptedTechnicProgram} from '../adapt-six-technic-models.mjs';
export const SIX_INTAKES=Object.freeze(['rod-ratio','vernier-drive','line-turner','dune-strider','atlas-six','oblique']);
export const INTAKE_ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const intakeHash=b=>createHash('sha256').update(b).digest('hex');
export const intakeRead=p=>readFileSync(new URL('../../'+p,import.meta.url));
export function reviewedIntakeContract(id,{frameMs}={}){
 assert.ok(SIX_INTAKES.includes(id));
 const file=id==='rod-ratio'||id==='vernier-drive'||id==='line-turner'?'docs/contract.json':'validation/acceptance-contract.json';
 const original=intakeRead('test/fixtures/model-files/'+id+'-source/'+file),contract=JSON.parse(original);
 const sourceHead=execFileSync('git',['rev-parse','HEAD'],{cwd:INTAKE_ROOT,encoding:'utf8'}).trim();
 contract.reviewedRuntime={scope:'Current library regression; original physical limits retained',sourceHead,originalContractSha256:intakeHash(original),partMetadataSha256:intakeHash(intakeRead('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'))};
 const model=intakeRead('overlay/scratch-gui/static/sim-lab/models/'+id+'.ldr');
 // Runtime and input identity change when a supplied model is admitted. The
 // original contract remains immutable; every physical limit stays original.
 if(contract.expectedCheckout)contract.expectedCheckout=sourceHead;
 if(contract.expectedInputHashes)contract.expectedInputHashes.model=intakeHash(model);
 if(contract.runtimeSources)for(const file of Object.keys(contract.runtimeSources))contract.runtimeSources[file]=intakeHash(intakeRead(file));
 if(contract.inputs?.['models/'+id+'.ldr'])contract.inputs['models/'+id+'.ldr']=intakeHash(model);
 if(id==='atlas-six'){
  contract.expectedExtraMetadata=Object.fromEntries(curatedStockAudit(['32195a.dat']).entries.map(e=>[e.part,e.metadataSha256]));
  const program=intakeRead('overlay/scratch-gui/static/sim-lab/programs/atlas-six.bw');
  assert.equal(program.toString(),adaptedTechnicProgram(id),'Atlas uses only its reviewed deterministic shared-preparation derivative');
  contract.reviewedRuntime.programAdaptation={originalSha256:contract.expectedInputHashes.program,kind:'joined-shared-travel-preparation'};
  contract.expectedInputHashes.program=intakeHash(program);
 }
 if(id==='oblique')contract.inputs.model={...contract.inputs.model,bytes:model.length,sha256:intakeHash(model)};
 if(frameMs!==undefined){
  if(contract.recording)contract.recording.frameMs=frameMs;
  if(contract.timing?.frameMs!==undefined)contract.timing.frameMs=frameMs;
 }
 return contract;
}
