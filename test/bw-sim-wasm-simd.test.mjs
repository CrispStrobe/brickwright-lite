import {test} from 'node:test';
import assert from 'node:assert/strict';
import {supportsWasmSimd} from '../overlay/scratch-gui/src/lib/bw-sim/physics/wasm-simd.js';

test('the standard SIMD probe validates and compiles on the supported Node engine',()=>{
    let probe;
    assert.equal(supportsWasmSimd({validate:bytes=>{probe=bytes;return WebAssembly.validate(bytes);}}),true);
    assert.ok(probe instanceof Uint8Array);
    assert.doesNotThrow(()=>new WebAssembly.Module(probe));
    assert.equal(supportsWasmSimd(),true);
});

test('missing, unsupported or refused WebAssembly selects the scalar baseline',()=>{
    for(const wasm of [null,{}, {validate:()=>false},{validate:()=>{throw new Error('WASM disallowed');}}]){
        assert.equal(supportsWasmSimd(wasm),false);
    }
    let called=0;
    assert.equal(supportsWasmSimd({validate:bytes=>{called++;assert.ok(bytes.includes(253));return false;}}),false);
    assert.equal(called,1);
});
