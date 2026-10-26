#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reusable preflight for any candidate. A PASS here never admits a new mechanism.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {checkIntakeStructure, checkIntakeProgramOutcome} from './lib/robot-lab-intake-checks.mjs';

const args = process.argv.slice(2);
const file = args.shift();
if (!file || args.some(a => !/^--(?:drive|record|success)=/.test(a))) {
    throw new Error('Use MODEL.ldr|MODEL.mpd [--drive=A:semantic-part-id] [--record=recording.json] [--success=done] with the GUI-scope loader');
}
const drives = args.filter(a => a.startsWith('--drive=')).map(a => {
    const match = /^--drive=([A-F]):([\w.-]+)$/.exec(a);
    if (!match) throw new Error('A drive must name its real port and keyed input part');
    return [match[1], match[2]];
});
if (new Set(drives.map(([p]) => p)).size !== drives.length) throw new Error('Duplicate drive port');
const source = readFileSync(resolve(file), 'utf8');
const catalogue = catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))));
const prepared = prepareModel(source, catalogue, {mat: 'plain', autoPorts: false});
const structure = checkIntakeStructure(prepared, catalogue, {
    fixedMotorPorts: drives.map(([p]) => p), drivenParts: Object.fromEntries(drives)
});
const recording = args.find(a => a.startsWith('--record='));
const program = recording ? checkIntakeProgramOutcome(JSON.parse(readFileSync(resolve(recording.slice(9)), 'utf8')), {
    successVariable: args.find(a => a.startsWith('--success='))?.slice(10)
}) : null;
const result = {
    schema: 'brickwright-intake-preflight/v1',
    scope: 'Structural preflight and optional recorded completion only. An independently reviewed passive law, physical controls and actual app/persistence checks are still required.',
    ok: structure.ok && (!program || program.ok), structure, program
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
