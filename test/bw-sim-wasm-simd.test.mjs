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

// Only the package factory is replaced here: exercise the shipped loader's
// selection and rejection contract. Physical qualification uses the real package.
test('the shipped loader selects SIMD or baseline and preserves initialization failures', async()=>{
    const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
    const {tmpdir}=await import('node:os');
    const {join}=await import('node:path');
    const {pathToFileURL}=await import('node:url');
    const {spawnSync}=await import('node:child_process');
    const dir=mkdtempSync(join(tmpdir(),'jolt-loader-'));
    try{
        const hook=join(dir,'hook.mjs');
        writeFileSync(hook,`export async function resolve(s,c,next){
            if(!s.startsWith('jolt-physics/'))return next(s,c);
            const source='export default ()=>'+(process.env.BW_TEST_JOLT_FAIL==='1'
                ? '{throw new Error("measured initialization failure");}'
                : JSON.stringify(s));
            return {url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true};
        }`);
        const target=new URL('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js',import.meta.url).href;
        for(const supported of [true,false])for(const failure of [false,true]){
            const script=`import {register} from 'node:module';
                register(${JSON.stringify(pathToFileURL(hook).href)},import.meta.url);
                WebAssembly.validate=()=>${supported};
                const {loadJolt}=await import(${JSON.stringify(target)});
                try{console.log(JSON.stringify({value:await loadJolt()}));}
                catch(error){console.log(JSON.stringify({error:error.message}));}`;
            const result=spawnSync(process.execPath,['--input-type=module','--eval',script],{
                encoding:'utf8',timeout:30000,env:{...process.env,BW_TEST_JOLT_FAIL:failure?'1':'0'}
            });
            assert.equal(result.status,0,result.stderr);
            const actual=JSON.parse(result.stdout.trim());
            assert.deepEqual(actual,failure?{error:'measured initialization failure'}:
                {value:supported?'jolt-physics/wasm-simd-compat':'jolt-physics/wasm-compat'});
        }
    }finally{rmSync(dir,{recursive:true,force:true});}
});
