// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync, mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runRobotLabProgram} from './robot-lab-direct-vm.mjs';
import {catalogFrom} from '../../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {NINE_INTAKES, removeIntakeParts} from '../../scripts/lib/sim-lab-nine-intake-judge.mjs';

const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const hash = s => createHash('sha256').update(s).digest('hex');

/** Observe real controllers, floor contacts and VM globals without changing the run. */
export async function recordNineIntake(id, {frameMs = 1000 / 30, disconnect = false, directory, partMetadata} = {}) {
    const contract = NINE_INTAKES[id];
    if (!contract) throw new Error('No independently reviewed contract: ' + id);
    const original = read(`overlay/scratch-gui/static/sim-lab/models/${id}.ldr`);
    const modelText = disconnect ? removeIntakeParts(original, contract.disconnect) : original;
    const source = read(`overlay/scratch-gui/static/sim-lab/programs/${id}.bw`);
    const metadata = partMetadata || JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'));
    const record = await runRobotLabProgram(source, {
        catalog: catalogFrom(metadata),
        modelText, autoPorts: false, coldMs: 0, afterMs: 2000, frameMs, timeLimitMs: 90000,
        observeFrame: ({session, vm, hub, prepared}) => ({
            variables: Object.fromEntries(vm.runtime.targets.flatMap(t =>
                Object.values(t.variables || {}).map(v => [v.name, v.value]))),
            motorModes: Object.fromEntries(prepared.mechanism.actuators.map(a =>
                [a.port, hub.backend._controllers['ABCDEF'.indexOf(a.port)].mode])),
            groundContact: session.core.currentContactPairs().some(pair =>
                pair.includes('ground') && pair.includes(prepared.mechanism.hubs[0].body)),
            sessionFailed: session.failed ? String(session.failed) : null
        })
    });
    Object.assign(record, {
        inputs: {modelSha256: hash(modelText), programSha256: hash(source), catalogueSha256: hash(JSON.stringify(metadata))},
        recording: {frameMs, physicsStepMs: 5, coldMs: 0, afterMs: 2000, timeLimitMs: 90000},
        runtime: {node: process.version, head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim()},
        physicalControl: disconnect ? contract.disconnect : null
    });
    // Preserve the unjudged original even when an assertion below will fail.
    if (directory) {
        mkdirSync(directory, {recursive: true});
        const path = `${directory}/${id}-${disconnect ? 'disconnected' : 'intact'}-${frameMs === 25 ? '25ms' : 'browser'}.json.gz`;
        if (existsSync(path)) throw new Error('Refusing to overwrite original evidence: ' + path);
        writeFileSync(path, gzipSync(JSON.stringify(record)));
    }
    return record;
}
