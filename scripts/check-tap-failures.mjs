#!/usr/bin/env node
// Preserve real failed outcomes, including failures omitted by a runner summary.
import {readFileSync} from 'node:fs';
import {tapOutcomes} from './lib/tap-outcomes.mjs';
if (process.argv.length !== 3) {
    console.error('usage: check-tap-failures.mjs <run.tap>');
    process.exit(2);
}
const outcomes = tapOutcomes(readFileSync(process.argv[2], 'utf8'));
const failures = outcomes.filter(row => !row.ok && !row.directive);
if (failures.length) {
    console.error(`TAP reports ${failures.length} ordinary failed outcome(s), including any construction failures:`);
    for (const row of failures.slice(0, 20)) console.error(row.line);
    process.exitCode = 1;
} else console.log(`TAP: no ordinary failed outcomes; ${outcomes.filter(row => row.directive === 'TODO').length} explicit pending outcome(s)`);
