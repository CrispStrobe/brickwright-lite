import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const source='function letter(code:number):string{return String.fromCharCode(code)};let a=letter(-1);let b=letter(65536);let c=letter(65537.9);let d=letter(0/0);let e=letter(1/0);let f=letter(55357);let g=letter(56832);let h=f.concat(g);let n:string=null;let u:string=undefined;let cn="a".concat(n);let cu="a".concat(u);let nn:number=null;let un:number=undefined;let an=String.fromCharCode(nn);let au=String.fromCharCode(un);let as=String.fromCharCode(<any>"65");let cm="a".concat(<any>(0/0));let done=1;done+=0;';
const names=['a','b','c','d','e','f','g','h','cn','cu','an','au','as','cm','done'];
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('original UTF-16 and nullable primitive strings survive source, Code, original export, reimport and fresh SB3', {todo:"procedure constraint producer not yet proven \u2014 see docs/ARCADE-888-OPEN-FAILURES.md"},async()=>{
    const expected=await runPxtArcade(source);assert.equal(expected.h,'😀');assert.equal(expected.f.length,1);assert.equal(expected.cn,'anull');assert.equal(expected.cu,'aundefined');
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const name of names)assert.equal(values(run)[name],expected[name],name);};
    let run,fresh;
    try {
        run=await runProgram(imported.code,{frames:60,storage:true});check(run);
        check(await runProgram(run.creator.decompile(),{frames:60,storage:true}));
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
        const oracle=await runPxtArcade(exported.files);for(const name of names)assert.equal(oracle[name]??oracle['Game_'+name],expected[name],name+' exported');
        const restored=arcadeToPseudocode(exported.files);assert.deepEqual(restored.unsupported,[]);check(await runProgram(restored.code,{frames:60,storage:true}));
        const sb3=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});fresh.vm.stopAll();await fresh.vm.loadProject(sb3);fresh.vm.greenFlag();await stepFrames(fresh.vm,60);check(fresh);
    } finally {run?.vm.quit?.();fresh?.vm.quit?.();clearStrayTimers();}
});

test('wrong string arity, shadowed String and known opaque arguments retain diagnostics',()=>{
    for(const source of ['String.fromCharCode()','String.fromCharCode(1,2)','let String=3;String.fromCharCode(65)','let s="a";s.concat()','let s="a";s.concat("b","c")','String.fromCharCode([65])','"a".concat(["b"])'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
