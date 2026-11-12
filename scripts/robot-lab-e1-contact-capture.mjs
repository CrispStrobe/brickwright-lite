// SPDX-License-Identifier: BSD-3-Clause
// Run from the intended checkout with the E1 diagnostic loader; the output must be a new file.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=process.cwd();
const read=p=>readFileSync(root+'/'+p,'utf8');
globalThis.__e1={bodies:[],contacts:[]};
const {runRobotLabProgram}=await import(root+'/test/helpers/robot-lab-direct-vm.mjs');
const c=JSON.parse(read('docs/data/robot-lab-qualification.json')).models?.find(x=>x.id==='rimrun');
if(!c)throw Error('missing contract');
const lab='overlay/scratch-gui/static/sim-lab/';
const result=await runRobotLabProgram(read(lab+'programs/rimrun.bw'),{...c,modelText:read(lab+'models/rimrun.ldr'),autoPorts:false,observeFrame:({session})=>({contacts:session.core.currentContactPairs()})});
const data={schema:'e1.capture.v1',boundary:'instrumented JS callback body order; inference of narrow-phase order must account for callback ordering, native sort, and cache',c,...result,bodies:globalThis.__e1.bodies,contacts:globalThis.__e1.contacts};
const out=process.argv[2];if(!out)throw Error('provide an output path');if(!data.bodies.length||!data.contacts.length)throw Error('instrumentation absent or no contacts');writeFileSync(out,JSON.stringify(data)+'\n',{flag:'wx'});console.log(JSON.stringify({contacts:data.contacts.length,bodies:data.bodies.length,frames:data.track.length,finishedAt:data.finishedAt,sha256:createHash('sha256').update(readFileSync(out)).digest('hex')}));
