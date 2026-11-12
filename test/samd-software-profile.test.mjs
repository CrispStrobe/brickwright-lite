// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {admitSamdProfile,loadSamdSoftwareProfile} from '../overlay/scratch-gui/src/lib/bw-debug/samd-software-profile.js';
import {SAMD_ENGINE_SOURCE,SAMD_PROFILE_SHA256} from '../overlay/scratch-gui/src/lib/bw-debug/samd-release-pins.js';
import {readFile,mkdtemp,mkdir,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
if (!globalThis.crypto) globalThis.crypto=webcrypto;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source='a'.repeat(40);
function fixture () {
    const fields={chip_yaml:'configs/chips/samd51-no-asf-simulation.yaml',system_yaml:'configs/systems/samd51-no-asf-simulation.yaml',display_yaml:'configs/devices/st7735r-memory-simulation.yaml'};
    const profile={schema:1,source,profile:'samd51-no-asf-simulation',kind:'authored-software-profile',physical_capture:false,boundary:'authored simulation',source_bindings:{},inputs:{}};
    for(const [field,path] of Object.entries(fields)){profile[field]='# '+field+'\n';const b=Buffer.from(profile[field]);profile.source_bindings[path]={bytes:b.length,sha256:sha(b)};}
    for(const name of ['LABWIRED_SAMD51_SIM_SW0','LABWIRED_SAMD51_SIM_SERIAL']){const b=Buffer.alloc(1024);profile.inputs[name]={encoding:'hex',data:b.toString('hex'),bytes:b.length,sha256:sha(b)};}
    return profile;
}
function request(profile, overrides={}){const bytes=Buffer.from(JSON.stringify(profile));return {bytes,expectedSha256:sha(bytes),engineSource:source,...overrides};}
test('admission joins the profile, engine, source configurations and both input packets',async()=>{
    const p=fixture(),result=await admitSamdProfile(request(p));
    assert.equal(result.profile.source,source);assert.deepEqual(Object.keys(result.inputs).sort(),Object.keys(p.inputs).sort());
    assert.equal(result.inputs.LABWIRED_SAMD51_SIM_SW0.length,1024);
});
test('admission parses the same snapshot it hashes when the caller reuses its buffer',async()=>{
    const args=request(fixture());
    const pending=admitSamdProfile(args);
    args.bytes.fill(0);
    const result=await pending;
    assert.equal(result.profile.source,source);
});
test('browser pin identities agree with the release synchronizer',async()=>{
    const sync=await readFile(new URL('../scripts/sync-labwired-wasm.mjs',import.meta.url),'utf8');
    assert.match(sync,new RegExp(`const PIN = '${SAMD_ENGINE_SOURCE}';`));
    assert.match(sync,new RegExp(`'samd-no-asf-profile.json': '${SAMD_PROFILE_SHA256}'`));
});
test('the real sync command refuses a mismatched browser release pin before fetching',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'samd-pin-control-'));
    try {
        await mkdir(join(dir,'scripts'),{recursive:true});
        const leaf=join(dir,'overlay/scratch-gui/src/lib/bw-debug');
        await mkdir(leaf,{recursive:true});
        for(const file of ['sync-labwired-wasm.mjs','lib-pin.mjs']) {
            await copyFile(new URL(`../scripts/${file}`,import.meta.url),join(dir,'scripts',file));
        }
        await writeFile(join(leaf,'samd-release-pins.js'),
            `export const SAMD_ENGINE_SOURCE = '${SAMD_ENGINE_SOURCE}';\nexport const SAMD_PROFILE_SHA256 = '${'0'.repeat(64)}';\n`);
        const result=spawnSync(process.execPath,[join(dir,'scripts/sync-labwired-wasm.mjs'),'--check'],{encoding:'utf8'});
        assert.notEqual(result.status,0);
        assert.match(result.stderr,/browser SAMD_PROFILE_SHA256 differs/);
    } finally {await rm(dir,{recursive:true,force:true});}
});
test('shipped profile loading refuses missing and unpinned bytes',async()=>{
    let requested;
    await assert.rejects(loadSamdSoftwareProfile({base:'https://example.test/app/',fetcher:async url=>{
        requested=url;return {ok:false};
    }}),/unavailable/);
    assert.equal(requested,'https://example.test/app/static/labwired/samd-no-asf-profile.json');
    await assert.rejects(loadSamdSoftwareProfile({base:'https://example.test/',fetcher:async()=>({
        ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer
    })}),/SHA-256/);
});
test('admission refuses changed bytes, wrong engine and physical relabel',async()=>{
    await assert.rejects(admitSamdProfile(request(fixture(),{expectedSha256:'0'.repeat(64)})),/SHA-256/);
    await assert.rejects(admitSamdProfile(request(fixture(),{engineSource:'b'.repeat(40)})),/different engine/);
    await assert.rejects(admitSamdProfile(request({...fixture(),physical_capture:true})),/software simulation/);
});
test('closed configuration and input fields cannot be widened or silently corrupted',async()=>{
    for(const mutate of [p=>p.extra=true,p=>delete p.source_bindings['configs/chips/samd51-no-asf-simulation.yaml'],p=>p.source_bindings['configs/chips/samd51-no-asf-simulation.yaml'].extra=true,p=>p.inputs.LABWIRED_SAMD51_SIM_SW0.extra=true,p=>p.inputs.LABWIRED_SAMD51_SIM_SW0.data='ff'+p.inputs.LABWIRED_SAMD51_SIM_SW0.data.slice(2),p=>delete p.inputs.LABWIRED_SAMD51_SIM_SERIAL]){const p=fixture();mutate(p);await assert.rejects(admitSamdProfile(request(p)));}
});
