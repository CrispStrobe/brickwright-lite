#!/usr/bin/env node
/*
 * Target-level simulator benchmark.
 *
 * Unlike bw-board's core dispatch benchmark, this measures the adapter that
 * Brickwright actually drives for AVR boards and the shipped Pybricks hub.
 * When LABWIRED_WASM and LABWIRED_CORE are set it also measures the exact
 * LabWired nRF52833 and ATSAMD51 descriptors from the pinned engine source.
 *
 *   npm run bench:board-targets
 *   LABWIRED_WASM=/path/to/nodejs LABWIRED_CORE=/path/to/labwired-core \
 *     npm run bench:board-targets
 */

import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const passes = 3;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const timed = async fn => {
    const start = process.hrtime.bigint();
    await fn();
    return Number(process.hrtime.bigint() - start) / 1e9;
};

const rows = [];

async function benchAvr () {
    const modulePath = resolve(root, 'node_modules/bw-board/src/avr8js-adapter.js');
    const {createAvr8jsAdapter} = await import(pathToFileURL(modulePath));
    const program = new Uint16Array([0x0c01, 0x9403, 0xcffd]); // add; inc; rjmp
    const board = {setPin () {}, advanceTo () {}, readPin () { return 0; }, readAnalog () { return 0; }};
    for (const [target, chip, clockHz] of [
        ['Arduboy', 'atmega32u4', 16_000_000],
        ['Blinkenrocket / ATtiny88', 'attiny88', 8_000_000],
        ['Arduino Uno', 'atmega328p', 16_000_000]
    ]) {
        const adapter = createAvr8jsAdapter({chip, program});
        adapter.attachBoard(board);
        const samples = [];
        const simulatedSeconds = 3;
        for (let pass = 0; pass < passes; pass++) {
            const seconds = await timed(() => adapter.advanceNs(simulatedSeconds * 1_000_000_000));
            samples.push(simulatedSeconds / seconds);
        }
        rows.push({target, engine: 'avr8js adapter', clockHz, samples, medianRtx: median(samples)});
    }
}

async function benchPybricks () {
    const assetDir = resolve(root, 'overlay/scratch-gui/static/pybricks-sim');
    const {createPybricksHost} = await import(pathToFileURL(resolve(root,
        'overlay/scratch-gui/src/lib/pybricks-sim/pybricks-hub-host.js')));
    const require = createRequire(import.meta.url);
    const factory = require(resolve(assetDir, 'pybricks-hub.js'));
    const wasmBinary = readFileSync(resolve(assetDir, 'pybricks-hub.wasm'));
    const host = await createPybricksHost({factory, wasmBinary, realtime: false});
    await host.boot();
    // Longer single idles can trip Pybricks' own shutdown horizon; repeat this
    // stable window instead of turning a benchmark into a firmware-lifecycle test.
    const simulatedMs = 10_000;
    const samples = [];
    for (let pass = 0; pass < passes; pass++) {
        const seconds = await timed(() => host.idle(simulatedMs));
        samples.push((simulatedMs / 1000) / seconds);
    }
    rows.push({target: 'SPIKE Prime', engine: 'Pybricks WASM', samples, medianRtx: median(samples),
        note: 'Unpaced throughput; the browser deliberately selects realtime=true.'});
}

function cortexImage (loadAddress) {
    const words = loadAddress === 0
        ? [0x1000, 0x2000, 0x0009, 0x0000, 0x2000, 0x2120, 0x0609, 0x3001, 0x6008, 0x680a, 0xe7fb]
        : [0x2000, 0x2000, 0x0009, 0x0800, 0x2000, 0x2120, 0x0609, 0x3001, 0x6008, 0x680a, 0xe7fb];
    const image = new Uint8Array(words.length * 2);
    words.forEach((word, index) => {
        image[index * 2] = word & 0xff;
        image[index * 2 + 1] = word >>> 8;
    });
    return image;
}

async function benchLabwired () {
    const wasmDir = process.env.LABWIRED_WASM;
    const core = process.env.LABWIRED_CORE;
    if (!wasmDir || !core) return;
    const require = createRequire(import.meta.url);
    const wasm = require(resolve(wasmDir, 'labwired_wasm.js'));
    const {binToElf} = await import(pathToFileURL(resolve(root, 'node_modules/bw-board/src/bin-to-elf.js')));
    for (const [target, clockHz, descriptor] of [
        ['micro:bit v2', 64_000_000, 'configs/chips/nrf52833.yaml'],
        ['PyBadge-class ATSAMD51', 120_000_000, 'configs/chips/atsamd51.yaml']
    ]) {
        const chipYaml = readFileSync(resolve(core, descriptor), 'utf8');
        const firmware = binToElf(cortexImage(0), {loadAddress: 0});
        const sim = wasm.WasmSimulator.new_from_config(
            'name: bench\nchip: ./chip.yaml\nboard_io: []\n', chipYaml, firmware, undefined);
        const tick = sim.recommended_tick_interval();
        sim.set_peripheral_tick_interval(tick);
        sim.step_batch(50_000);
        const samples = [];
        for (let pass = 0; pass < passes; pass++) {
            const steps = 40_000_000;
            const seconds = await timed(() => {
                for (let done = 0; done < steps; done += 50_000) sim.step_batch(50_000);
            });
            samples.push((steps / seconds) / clockHz);
        }
        rows.push({target, engine: 'LabWired WASM', clockHz, tick, samples, medianRtx: median(samples),
            note: 'Core-loop ceiling; board peripheral completeness is reported separately.'});
    }
}

for (const bench of [benchAvr, benchPybricks, benchLabwired]) {
    try {
        await bench();
    } catch (error) {
        rows.push({target: bench.name, skipped: error.message});
    }
}

const output = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    host: `${process.platform}/${process.arch} Node ${process.version}`,
    metric: 'simulated seconds per wall second (1.0x = real time)',
    rows: rows.map(row => ({...row,
        samples: row.samples?.map(value => Number(value.toFixed(3))),
        medianRtx: row.medianRtx === undefined ? undefined : Number(row.medianRtx.toFixed(3))
    }))
};
console.log(JSON.stringify(output, null, 2));
