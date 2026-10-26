// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {admitSamdProfile} from '../scripts/verify-samd-native-game.mjs';
const source = '0123456789abcdef0123456789abcdef01234567';
const sha = raw => createHash('sha256').update(raw).digest('hex');
function fixture () {
    const data = Buffer.alloc(1024); const body = {};
    const source_bindings = {};
    for (const [field, name] of Object.entries({chip_yaml:'configs/chips/samd51-no-asf-simulation.yaml',system_yaml:'configs/systems/samd51-no-asf-simulation.yaml',display_yaml:'configs/devices/st7735r-memory-simulation.yaml'})) {
        body[field] = `# authored ${field}\n`;
        source_bindings[name] = {bytes:Buffer.byteLength(body[field]),sha256:sha(body[field])};
    }
    const packet = () => ({encoding:'hex',data:data.toString('hex'),bytes:1024,sha256:sha(data)});
    return {schema:1,source,profile:'samd51-no-asf-simulation',kind:'authored-software-profile',physical_capture:false,source_bindings,...body,inputs:{LABWIRED_SAMD51_SIM_SW0:packet(),LABWIRED_SAMD51_SIM_SERIAL:packet()}};
}
const request = (value, extra = {}) => {
    const bytes = Buffer.from(JSON.stringify(value));
    return {bytes,expectedSha256:sha(bytes),engineSource:source,...extra};
};
test('consumer admits all exact source and authored input bytes without a guest claim', async () => {
    const input = fixture(); const result = await admitSamdProfile(request(input));
    assert.equal(result.profile.source,source);
    assert.equal(result.inputs.LABWIRED_SAMD51_SIM_SW0.length,1024);
    assert.equal(result.inputs.LABWIRED_SAMD51_SIM_SERIAL.length,1024);
    assert.deepEqual(result.profile.source_bindings,input.source_bindings);
});
test('consumer refuses a changed release, different engine or physical relabel', async () => {
    await assert.rejects(admitSamdProfile(request(fixture(),{expectedSha256:'0'.repeat(64)})),/SHA-256 mismatch/);
    await assert.rejects(admitSamdProfile(request(fixture(),{engineSource:'f'.repeat(40)})),/different engine/);
    await assert.rejects(admitSamdProfile(request({...fixture(),physical_capture:true})),/software simulation/);
});
test('consumer independently refuses source edits and missing or foreign configuration', async () => {
    await assert.rejects(admitSamdProfile(request({...fixture(),chip_yaml:'edited'})),/byte binding mismatch/);
    const absent = fixture(); delete absent.source_bindings['configs/devices/st7735r-memory-simulation.yaml'];
    await assert.rejects(admitSamdProfile(request(absent)),/closed source/);
    const foreign = fixture(); foreign.source_bindings['private'] = {bytes:1,sha256:sha('x')};
    await assert.rejects(admitSamdProfile(request(foreign)),/closed source/);
});
test('consumer refuses a silently zeroed calibration byte and partial input union', async () => {
    const changed = fixture(); changed.inputs.LABWIRED_SAMD51_SIM_SW0.data = 'ff'+changed.inputs.LABWIRED_SAMD51_SIM_SW0.data.slice(2);
    await assert.rejects(admitSamdProfile(request(changed)),/input SHA-256/);
    const missing = fixture(); delete missing.inputs.LABWIRED_SAMD51_SIM_SERIAL;
    await assert.rejects(admitSamdProfile(request(missing)),/closed authored input/);
});
