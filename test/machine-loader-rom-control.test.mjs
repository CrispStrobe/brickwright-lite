/** P6a: the existing UI route can put an 8086 fixture behind Machine Loader. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {SOURCE, REPO} from './helpers/bw-integrated.mjs';
import {requireTimerdemoDelivery} from '../scripts/verify-machine-loader-rom-control.mjs';

const fixture = JSON.parse(readFileSync(path.join(REPO, 'test/fixtures/reseat/e4-reseated-8086.json'), 'utf8'));
const {extract8086Machine} = await import(path.join(SOURCE, 'src/lib/bw-board/i8086-extract.js'));

test('the uploaded fixture is a complete extractable 8086 machine', () => {
    const result = extract8086Machine(fixture);
    assert.equal(result.ok, true, (result.reasons || []).join('; '));
    assert.ok(fixture.parts.some(part => part.kind === 'i8086'), 'fixture lost the CPU that exposes Machine Loader');
    assert.ok(result.chips.some(chip => chip.kind === 'ppi'), 'fixture lost its programmable 8255');

    const withoutCpu = structuredClone(fixture);
    withoutCpu.parts = withoutCpu.parts.filter(part => part.kind !== 'i8086');
    assert.equal(extract8086Machine(withoutCpu).ok, false,
        'mutation without the CPU still extracted, so the fixture no longer proves the loader precondition');
});

test('the real File menu route and timerdemo dispatch seam remain connected', () => {
    const menu = readFileSync(path.join(SOURCE, 'src/components/menu-bar/menu-bar.jsx'), 'utf8');
    const designer = readFileSync(path.join(SOURCE,
        'src/lib/bw-circuit-ui/components/CircuitDesigner.jsx'), 'utf8');
    const panel = readFileSync(path.join(SOURCE, 'src/components/tw-pseudocode/debug-panel.jsx'), 'utf8');

    assert.match(menu, /CustomEvent\('bw-circuit-file', \{detail: \{action: 'load'\}\}\)/,
        'File > Open circuit no longer emits the load action used by the gate');
    assert.match(designer, /action === 'load'[\s\S]*?input\.type = 'file'[\s\S]*?handleLoad\(JSON\.parse/,
        'Circuit Designer no longer turns the menu action into a JSON circuit load');
    assert.match(designer, /id: 'timerdemo'[\s\S]*?rom: 'i8086-timer-demo\.bin'[\s\S]*?profile: 'timerdemo'/,
        'the landed timerdemo test id no longer describes the expected ROM/profile');
    assert.match(designer, /CustomEvent\('bw-machine-media-load'/,
        'Machine Loader no longer dispatches its public media event');
    assert.match(panel, /addEventListener\('bw-machine-media-load', this\._onMediaLoad\)/,
        'the debugger no longer consumes Machine Loader media');
    assert.match(panel, /async _onMediaLoad[\s\S]*?await runner\.start\(\)/,
        'the debugger consumer no longer creates and starts the media-backed runner');
});

test('the shared success verdict fails closed and names the missing preset', () => {
    const good = {status: 200, event: {profile: 'timerdemo', name: 'i8086-timer-demo.bin',
        kind: 'i8086', slotId: 'rom', byteLength: 32768}, panelState: 'empty'};
    assert.equal(requireTimerdemoDelivery(good), true);
    assert.throws(() => requireTimerdemoDelivery({...good, status: 404, event: null}),
        /timerdemo preset fetch failed: HTTP 404/);
    assert.throws(() => requireTimerdemoDelivery({...good, panelState: 'none'}),
        /did not reach an attached debugger collector: none/);
});
