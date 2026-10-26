#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Portable package admission. This alone makes no actual-guest acceptance claim.
const need = (ok, why) => { if (!ok) throw new Error(why); };
const hex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
const sha = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const encode = value => new TextEncoder().encode(value);
export async function admitSamdProfile ({bytes, expectedSha256, engineSource}) {
    need(/^[0-9a-f]{64}$/.test(expectedSha256) && /^[0-9a-f]{40}$/.test(engineSource), 'immutable engine and profile identities required');
    need(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length < 512_000, 'bounded profile asset');
    need(await sha(bytes) === expectedSha256, 'pinned profile asset SHA-256 mismatch');
    const profile = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
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
        need(raw.length > 0 && raw.length < 128_000 && raw.length === binding.bytes && await sha(raw) === binding.sha256, 'source YAML byte binding mismatch');
    }
    const names = ['LABWIRED_SAMD51_SIM_SW0', 'LABWIRED_SAMD51_SIM_SERIAL'];
    need(JSON.stringify(Object.keys(profile.inputs).sort()) === JSON.stringify(names.sort()), 'closed authored input union required');
    const inputs = {};
    for (const name of names) {
        const input = profile.inputs[name];
        need(input.encoding === 'hex' && /^[0-9a-f]{2048}$/.test(input.data) && input.bytes === 1024, 'explicit authored input bytes required');
        const raw = Uint8Array.from(input.data.match(/../g), n => parseInt(n, 16));
        need(await sha(raw) === input.sha256, 'authored input SHA-256 mismatch');
        inputs[name] = raw;
    }
    return {profile, inputs};
}
if (typeof process !== 'undefined' && process.argv[1]) {
    const {fileURLToPath} = await import('node:url');
    const {resolve} = await import('node:path');
    if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
        need(process.argv.length === 5, 'profile-file pinned-profile-sha256 engine-source required');
        const {readFile} = await import('node:fs/promises');
        const {profile} = await admitSamdProfile({bytes: await readFile(process.argv[2]), expectedSha256: process.argv[3], engineSource: process.argv[4]});
        console.log(JSON.stringify({status:'SAMD_PROFILE_METADATA_ADMITTED', source:profile.source, actual_guest_qualified:false, physical_capture:false}));
    }
}
