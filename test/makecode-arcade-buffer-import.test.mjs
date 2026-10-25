import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('namespace Buffer imports retain mutable aliases, detached slices, typed procedure arguments and original exports',async()=>{
    const source=`namespace Bytes {
export const data=Buffer.fromHex("01020304")
export const fixed=hex\`abcd\`
export function mutate(value:Buffer){value[1]=9;return value.toHex()}
}
let alias=Bytes.data
let viaCall=Bytes.mutate(alias)
let copy=alias.slice(1,2)
copy[0]=99
let detached=copy.toHex()
let aliased=Bytes.data.toHex()
alias.setNumber(NumberFormat.UInt16BE,0,4660)
let format=NumberFormat.UInt16BE
let number=alias.getNumber(format,0)
let bytes=control.createBuffer(4)
bytes.fill(7)
bytes.write(1,alias)
let result=bytes.toHex()
let fixedHex=Bytes.fixed.toHex()
let decoded=Buffer.fromUTF8("A€").toString()
let count=alias.length`;
    const original=await runPxtArcade(source);
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const keys=['viaCall','detached','aliased','number','result','fixedHex','decoded','count'];
    try {
        const run=await runProgram(imported.code,{frames:70,storage:true});
        const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const got=values(run);for(const key of keys)assert.equal(got[key],original[key],key);};
        check(run);
        check(await runProgram(run.creator.decompile(),{frames:70,storage:true}));
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
        const pxt=await runPxtArcade(exported.files);for(const key of keys)assert.equal(pxt[key] ?? pxt['Game_'+key],original[key],key+' exported');
        const again=arcadeToPseudocode(exported.ts);assert.deepEqual(again.unsupported,[]);check(await runProgram(again.code,{frames:70,storage:true}));
        await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,70);check(run);
    }finally{clearStrayTimers();}
});

test('Buffer imports keep explicit diagnostics for unsupported views and namespace initialization order',()=>{
    assert.match(arcadeToPseudocode('let data=Buffer.fromHex("0102");let view=data.subarray(0,1)').unsupported.join('\n'),/shared-view block/);
    assert.match(arcadeToPseudocode('let data=Bytes.data;namespace Bytes {export const data=hex`0102`}').unsupported.join('\n'),/before initialization/);
    assert.match(arcadeToPseudocode('namespace Bytes {export const data=hex`0102`} Bytes.data=hex`0304`').unsupported.join('\n'),/readonly namespace binding/);
    assert.match(arcadeToPseudocode('let data=hex`xyz`').unsupported.join('\n'),/complete hexadecimal bytes/);
});
