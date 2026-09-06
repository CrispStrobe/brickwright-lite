import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {ControllerPanel} from '../overlay/scratch-gui/src/lib/bw-board/controller.js';

const module = await import('../overlay/scratch-gui/src/lib/bw-project-bundle.js');

const storage = initial => {
    const values = new Map(Object.entries(initial));
    return {
        get length () { return values.size; },
        key: index => [...values.keys()][index] ?? null,
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
        dump: () => Object.fromEntries(values)
    };
};

const baseArchive = async () => {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify({
        targets: [{isStage: true, name: 'Stage', blocks: {}, costumes: [], sounds: []}],
        extensions: ['spikeprime'],
        extensionURLs: {
            spikeprime: 'https://crispstrobe.github.io/extensions/CrispStrobe/legospike_turbowarp_transpile.js'
        },
        meta: {semver: '3.0.0'}
    }));
    return zip.generateAsync({type: 'nodebuffer'});
};

test('real attach/extract is deterministic and preserves all typed project surfaces', async () => {
    const code = {lang: 'pseudocode', code: 'DEVICE SPIKE\nWHEN flag clicked:\n  stop motor A'};
    const circuit = {version: 1, parts: [{id: 'hub', kind: 'spikeprime', seat: {x: 3, y: 4}}],
        wires: [], pcb: {board: 'lesson', revision: 2}};
    const panel = new ControllerPanel();
    const speed = panel.addWidget('speed', 'slider', {min: 0, max: 100}, {x: 10, y: 20});
    speed.binding = {kind: 'variable', name: 'speed'};
    panel.setMode('play');
    const controller = panel.toJSON();
    const expectedRaw = {
        'bw-code-autosave': JSON.stringify(code),
        'bw-circuit-autosave': JSON.stringify(circuit),
        'bw-ctl-widgets': JSON.stringify(controller)
    };

    global.localStorage = storage(expectedRaw);
    global.window = {dispatchEvent: () => {}};
    global.CustomEvent = class { constructor (type) { this.type = type; } };
    try {
        const base = await baseArchive();
        const fixed = () => new Date('2026-09-01T00:00:00.000Z');
        const first = await module.attachBrickwrightState(new Blob([base]), {now: fixed});
        const second = await module.attachBrickwrightState(new Blob([base]), {now: fixed});
        const firstZip = await JSZip.loadAsync(await first.arrayBuffer());
        const secondZip = await JSZip.loadAsync(await second.arrayBuffer());
        const firstText = await firstZip.file(module.BUNDLE_PATH).async('text');
        const secondText = await secondZip.file(module.BUNDLE_PATH).async('text');
        assert.equal(firstText, secondText, 'fixed-clock sidecar bytes must be deterministic');

        const document = JSON.parse(firstText);
        assert.equal(document.format, module.BUNDLE_FORMAT);
        assert.equal(document.version, module.BUNDLE_VERSION);
        assert.deepEqual(document.state, {code, circuit, controller});
        const project = JSON.parse(await firstZip.file('project.json').async('text'));
        assert.deepEqual(project.extensions, ['spikeprime']);
        assert.match(project.extensionURLs.spikeprime, /legospike_turbowarp_transpile/);

        global.localStorage = storage({'bw-theme': 'dark'});
        const bytes = Buffer.from(await first.arrayBuffer());
        const result = await module.extractBrickwrightState(
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        assert.equal(result.outcome, 'loaded');
        assert.deepEqual(global.localStorage.dump(), {...expectedRaw, 'bw-theme': 'dark'});
        const restoredPanel = ControllerPanel.fromJSON(
            JSON.parse(global.localStorage.getItem('bw-ctl-widgets')));
        assert.equal(restoredPanel.mode, 'play');
        assert.deepEqual(restoredPanel.getWidget('speed').binding,
            {kind: 'variable', name: 'speed'});
        const restoredCircuit = JSON.parse(global.localStorage.getItem('bw-circuit-autosave'));
        assert.deepEqual(restoredCircuit.parts[0].seat, {x: 3, y: 4});
        assert.deepEqual(restoredCircuit.pcb, {board: 'lesson', revision: 2});
    } finally {
        delete global.localStorage;
        delete global.window;
        delete global.CustomEvent;
    }
});
