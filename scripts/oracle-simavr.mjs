#!/usr/bin/env node
/* Optional local oracle runner. The GPL simulator is never bundled or linked. */
import {execFile} from 'node:child_process';
import {readFile, unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseVcd} from './oracle-trace.mjs';

function usage() {
    console.error('usage: node scripts/oracle-simavr.mjs --firmware file.elf --mcu atmega328p --clock 16000000 --signal NAME=PIN');
    process.exit(2);
}

const args = process.argv.slice(2);
const value = name => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
};
const firmware = value('--firmware');
const mcu = value('--mcu') || 'atmega328p';
const clock = value('--clock') || '16000000';
if (!firmware) usage();

const signals = {};
for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--signal') continue;
    const [source, pin] = String(args[++i] || '').split('=');
    if (!source || !pin) usage();
    signals[source] = pin;
}
if (!Object.keys(signals).length) {
    console.error('at least one --signal SOURCE=PIN mapping is required');
    process.exit(2);
}

const vcd = join(tmpdir(), `brickwright-simavr-${process.pid}.vcd`);
try {
    await new Promise((resolve, reject) => {
        execFile('simavr', ['-m', mcu, '-f', clock, '-o', vcd, firmware], {maxBuffer: 4 * 1024 * 1024}, (error, stdout, stderr) => {
            if (error) reject(new Error(`simavr failed: ${error.message}\n${stderr || stdout}`));
            else resolve();
        });
    });
    process.stdout.write(`${JSON.stringify(parseVcd(await readFile(vcd, 'utf8'), {signals}), (_, x) => typeof x === 'bigint' ? String(x) : x)}\n`);
} finally {
    await unlink(vcd).catch(() => {});
}
