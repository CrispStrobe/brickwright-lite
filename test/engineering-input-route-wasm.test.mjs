import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEngineeringInputRoute} from '../overlay/scratch-gui/src/lib/bw-debug/engineering-input-route.js';
import {subscribeDebugTargetInputs} from '../overlay/scratch-gui/src/lib/bw-debug/recording-session.js';

const glue = process.env.LABWIRED_INPUT_WEB_GLUE;
const bytes = process.env.LABWIRED_INPUT_WEB_WASM;
const skip = !(glue && bytes) ? 'real engineering-input proof needs original WEB glue and WASM paths' : false;
if (skip && process.env.BW_REQUIRE_ENGINE_INPUT_PROOF === '1') throw Error(skip);
let wasm, createLabwiredAdapter, createLabwiredDebugTarget, binToElf, plain;
if (!skip) {
    const {importPackageSource} = await import('./helpers/package-source.mjs');
    ({createLabwiredAdapter, plain} = await importPackageSource('bw-board/labwired-adapter.js'));
    ({createLabwiredDebugTarget} = await importPackageSource('bw-board/labwired-debug.js'));
    ({binToElf} = await importPackageSource('bw-board/bin-to-elf.js'));
    wasm = await import('data:text/javascript;base64,' + readFileSync(glue).toString('base64'));
    await wasm.default({module_or_path: readFileSync(bytes)});
}

function setup () {
    const raw = new Uint8Array(64);
    const view = new DataView(raw.buffer);
    view.setUint32(0, 0x20001000, true);
    view.setUint32(4, 0x08000009, true);
    raw.set([0xfe, 0xe7], 8);
    const adapter = createLabwiredAdapter({wasm, firmwareOnly: true, firmware: binToElf(raw),
        chipYaml: `name: "route-f0"
arch: arm
core: cortex-m0
cpu_hz: 48000000
flash: {base: 0x08000000, size: "16KB"}
ram: {base: 0x20000000, size: "4KB"}
peripherals:
  - id: "adc"
    type: "stm32f0_adc"
    base_address: 0x40012400
    size: "1KB"
`,
        systemYaml: `name: "route-input-proof"
chip: "chip.yaml"
external_devices:
  - id: "left"
    type: "potentiometer"
    connection: "adc"
    config: {channel: 0}
  - id: "right"
    type: "potentiometer"
    connection: "adc"
    config: {channel: 1}
board_io: []
`});
    const target = createLabwiredDebugTarget({adapter});
    return {adapter, target, route: createEngineeringInputRoute({getTarget: () => target})};
}
const pose = (left, right) => [{component: 'left', channel: 'position', value: left},
    {component: 'right', channel: 'position', value: right}];
const counts = adapter => plain(adapter.sim.get_peripheral_snapshot('adc')).channel_inputs.slice(0, 2);

test('actual WASM: Lite route discovers component IDs and applies one recorded transaction', {skip}, () => {
    const {adapter, target, route} = setup();
    const facts = [];
    target.onDebugInput(fact => facts.push(fact));
    try {
        assert.deepEqual(route.discoverInputs().map(row => [row.peripheral, row.key]),
            [['left', 'position'], ['right', 'position']]);
        assert.equal(route.setInputs(pose(25, 75)).accepted, true);
        assert.deepEqual(counts(adapter), [1023, 3071]);
        assert.equal(facts.length, 1);
        assert.equal(facts[0].producer, 'labwired.inputs');
        assert.deepEqual(facts[0].payload.sets, pose(25, 75));
    } finally { target.detach(); adapter.sim.free(); }
});

test('actual WASM: a bad later channel range changes neither component and emits no fact', {skip}, () => {
    const {adapter, target, route} = setup();
    const facts = [];
    target.onDebugInput(fact => facts.push(fact));
    try {
        route.setInputs(pose(25, 75));
        assert.equal(route.setInputs(pose(50, 101)).accepted, false);
        assert.deepEqual(counts(adapter), [1023, 3071]);
        assert.equal(route.setInputs([{channel: 'position', value: 50}]).accepted, false);
        assert.equal(facts.length, 1);
    } finally { target.detach(); adapter.sim.free(); }
});

test('actual WASM: recorded input replays through the target without duplicate live facts', {skip}, () => {
    const {adapter, target, route} = setup();
    const facts = [];
    target.onDebugInput(fact => facts.push(fact));
    try {
        route.setInputs(pose(25, 75));
        adapter.setInputs(pose(50, 50));
        assert.equal(target.applyReplayInput(facts[0]).accepted, true);
        assert.deepEqual(counts(adapter), [1023, 3071]);
        assert.equal(facts.length, 1);
    } finally { target.detach(); adapter.sim.free(); }
});

test('actual WASM: production recording subscription records only accepted inputs while active', {skip}, () => {
    const {adapter, target, route} = setup();
    const recorded = [];
    let active = true;
    // Exercise the production subscription, not a complete recorder/checkpoint session.
    // This target has no pre-application admission hook: no lossless veto is claimed.
    const unsubscribe = subscribeDebugTargetInputs(target, {
        status: () => ({active}), appendInput: input => recorded.push(input)
    });
    try {
        assert.equal(route.setInputs(pose(25, 75)).accepted, true);
        assert.equal(recorded.length, 1);
        assert.equal(recorded[0].producer, 'labwired.inputs');
        assert.deepEqual(recorded[0].payload.sets, pose(25, 75));
        assert.equal(route.setInputs(pose(50, 101)).accepted, false);
        assert.equal(recorded.length, 1);
        active = false;
        assert.equal(route.setInputs(pose(50, 50)).accepted, true);
        assert.equal(recorded.length, 1);
        active = true;
        unsubscribe();
        assert.equal(route.setInputs(pose(75, 25)).accepted, true);
        assert.equal(recorded.length, 1);
    } finally { unsubscribe(); target.detach(); adapter.sim.free(); }
});
