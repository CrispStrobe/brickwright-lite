// SPDX-License-Identifier: BSD-3-Clause
// Explicit browser-side admission; callers must supply trusted release pins.
// This does not select a board or establish physical or guest qualification.
import {SAMD_ENGINE_SOURCE, SAMD_PROFILE_SHA256} from './samd-release-pins.js';
const need = (ok, why) => { if (!ok) throw new Error(why); };
const hex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
const sha = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const encode = value => new TextEncoder().encode(value);
export async function admitSamdProfile ({bytes, expectedSha256, engineSource}) {
    need(/^[0-9a-f]{64}$/.test(expectedSha256) && /^[0-9a-f]{40}$/.test(engineSource), 'immutable engine and profile identities required');
    need(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length < 512_000, 'bounded profile asset');
    // Hash and parse the same snapshot even if the caller reuses its buffer
    // while Web Crypto is pending.
    const snapshot = Uint8Array.from(bytes);
    need(await sha(snapshot) === expectedSha256, 'pinned profile asset SHA-256 mismatch');
    const profile = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(snapshot));
    need(JSON.stringify(Object.keys(profile).sort()) === JSON.stringify(['schema','source','profile','kind','physical_capture','source_bindings','chip_yaml','system_yaml','display_yaml','inputs','boundary'].sort()), 'closed profile fields required');
    need(typeof profile.boundary === 'string' && profile.boundary.length > 0 && profile.boundary.length < 4096, 'explicit profile boundary required');
    need(profile.schema === 1 && profile.source === engineSource, 'profile belongs to a different engine source');
    need(profile.profile === 'samd51-no-asf-simulation' && profile.kind === 'authored-software-profile' && profile.physical_capture === false, 'explicit software simulation profile required');
    const fields = {
        chip_yaml: 'configs/chips/samd51-no-asf-simulation.yaml',
        system_yaml: 'configs/systems/samd51-no-asf-simulation.yaml',
        display_yaml: 'configs/devices/st7735r-memory-simulation.yaml'
    };
    need(JSON.stringify(Object.keys(profile.source_bindings).sort()) === JSON.stringify(Object.values(fields).sort()), 'closed source configuration union required');
    for (const [field, name] of Object.entries(fields)) {
        need(typeof profile[field] === 'string', 'exact source YAML required');
        const raw = encode(profile[field]);
        const binding = profile.source_bindings[name];
        need(binding && JSON.stringify(Object.keys(binding).sort()) === JSON.stringify(['bytes','sha256']), 'closed source binding fields required');
        need(raw.length > 0 && raw.length < 128_000 && raw.length === binding.bytes && await sha(raw) === binding.sha256, 'source YAML byte binding mismatch');
    }
    const names = ['LABWIRED_SAMD51_SIM_SW0', 'LABWIRED_SAMD51_SIM_SERIAL'];
    need(JSON.stringify(Object.keys(profile.inputs).sort()) === JSON.stringify(names.sort()), 'closed authored input union required');
    const inputs = {};
    for (const name of names) {
        const input = profile.inputs[name];
        need(input && JSON.stringify(Object.keys(input).sort()) === JSON.stringify(['bytes','data','encoding','sha256']), 'closed input fields required');
        need(input.encoding === 'hex' && /^[0-9a-f]{2048}$/.test(input.data) && input.bytes === 1024, 'explicit authored input bytes required');
        const raw = Uint8Array.from(input.data.match(/../g), n => parseInt(n, 16));
        need(await sha(raw) === input.sha256, 'authored input SHA-256 mismatch');
        inputs[name] = raw;
    }
    return {profile, inputs};
}

/** Load the shipped authored profile against the sync script's release pins. */
export async function loadSamdSoftwareProfile ({base, fetcher = fetch}) {
    need(typeof base === 'string' && base.length > 0, 'document base required');
    const response = await fetcher(new URL('static/labwired/samd-no-asf-profile.json', base).href);
    need(response.ok, 'SAMD software profile asset unavailable');
    return admitSamdProfile({bytes: new Uint8Array(await response.arrayBuffer()),
        expectedSha256: SAMD_PROFILE_SHA256, engineSource: SAMD_ENGINE_SOURCE});
}
