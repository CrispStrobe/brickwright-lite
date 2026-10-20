import test from 'node:test';
import assert from 'node:assert/strict';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

test('compilation metadata observers receive a copy even for selected compiler refusals',async()=>{
    const source='let observerIsolationValue:number="invalid number"';
    let observed=0;
    await assert.rejects(runPxtArcade(source,{onCompilation:record=>{
        observed++;
        assert.equal(record.files['main.ts'],source);
        assert.equal(record.built.success,false);
        assert.ok(record.built.diagnostics.length);
        record.files['main.ts']='let observerIsolationValue:number=1';
        record.built.success=true;
        record.built.diagnostics=[];
        record.built.outfiles={'binary.js':'throw new Error("copied observer output")'};
    }}),/not assignable/);
    assert.equal(observed,1);
});

test('invalid compilation observers refuse before compiling or launching a guest',async()=>{
    await assert.rejects(runPxtArcade('let observerIsolationValue=1',{onCompilation:true}),/Compilation observer must be a function/);
});
