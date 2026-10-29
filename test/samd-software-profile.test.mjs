// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {admitSamdProfile} from '../overlay/scratch-gui/src/lib/bw-debug/samd-software-profile.js';
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
test('admission refuses changed bytes, wrong engine and physical relabel',async()=>{
    await assert.rejects(admitSamdProfile(request(fixture(),{expectedSha256:'0'.repeat(64)})),/SHA-256/);
    await assert.rejects(admitSamdProfile(request(fixture(),{engineSource:'b'.repeat(40)})),/different engine/);
    await assert.rejects(admitSamdProfile(request({...fixture(),physical_capture:true})),/software simulation/);
});
test('closed configuration and input fields cannot be widened or silently corrupted',async()=>{
    for(const mutate of [p=>p.extra=true,p=>delete p.source_bindings['configs/chips/samd51-no-asf-simulation.yaml'],p=>p.source_bindings['configs/chips/samd51-no-asf-simulation.yaml'].extra=true,p=>p.inputs.LABWIRED_SAMD51_SIM_SW0.extra=true,p=>p.inputs.LABWIRED_SAMD51_SIM_SW0.data='ff'+p.inputs.LABWIRED_SAMD51_SIM_SW0.data.slice(2),p=>delete p.inputs.LABWIRED_SAMD51_SIM_SERIAL]){const p=fixture();mutate(p);await assert.rejects(admitSamdProfile(request(p)));}
});
