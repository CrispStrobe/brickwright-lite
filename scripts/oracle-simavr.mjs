#!/usr/bin/env node
/* Optional local oracle runner. The GPL simulator is never bundled or linked. */
import {execFile} from 'node:child_process';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
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

const workDir = await mkdtemp(join(tmpdir(), 'brickwright-simavr-'));
const vcd = join(workDir, 'trace.vcd');
try {
    await new Promise((resolve, reject) => {
        // AMBIENT-BINDING, triaged 2026-09-02. An oracle is external by definition, and this one
        // fails CLOSED: an absent or failing simavr rejects with its own stderr rather than
        // returning a trace. The residual risk the marker does NOT dismiss is version identity —
        // a different simavr is still a different oracle, and nothing here pins one.
        // gate-shapes-allow
        execFile('simavr', ['-m', mcu, '-f', clock, '-o', vcd, firmware], {
            cwd: workDir,
            maxBuffer: 4 * 1024 * 1024,
        }, (error, stdout, stderr) => {
            if (error) reject(new Error(`simavr failed: ${error.message}\n${stderr || stdout}`));
            else resolve();
        });
    });
    // A firmware may carry AVR_MCU_VCD_FILE metadata; simavr then uses that
    // filename instead of the CLI output path. The isolated cwd makes that
    // behavior safe and deterministic rather than leaving files in the repo.
    const files = await readdir(workDir);
    const generated = files.filter(file => file.toLowerCase().endsWith('.vcd'));
    if (!generated.length) throw new Error('simavr completed without producing a VCD trace');
    const source = await readFile(join(workDir, generated[0]), 'utf8');
    process.stdout.write(`${JSON.stringify(parseVcd(source, {signals}), (_, x) => typeof x === 'bigint' ? String(x) : x)}\n`);
} finally {
    await rm(workDir, {recursive: true, force: true}).catch(() => {});
}
