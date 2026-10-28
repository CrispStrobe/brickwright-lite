#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
import {open, writeFile} from 'node:fs/promises';
import {LIMITS, metrics} from './lib/ci-run-metrics-windowed.mjs';
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!['--run', '--jobs', '--output'].includes(key) || !argv[i + 1] ||
        argv[i + 1].startsWith('--') || Object.hasOwn(args, key)) throw new Error('invalid or duplicate arguments');
    args[key] = argv[i + 1];
}
if (!args['--run'] || !args['--jobs']) throw new Error('usage: report-ci-run-metrics-windowed.mjs --run run.json --jobs jobs.json [--output report.json]');
async function load(path) {
    const file = await open(path, 'r');
    try {
        const buffer = Buffer.alloc(LIMITS.inputBytes + 1);
        let offset = 0;
        while (offset < buffer.length) {
            const {bytesRead} = await file.read(buffer, offset, buffer.length - offset, null);
            if (!bytesRead) break;
            offset += bytesRead;
        }
        if (offset > LIMITS.inputBytes) throw new Error('input exceeds byte bound');
        return buffer.subarray(0, offset);
    } finally { await file.close(); }
}
const report = metrics(await load(args['--run']), await load(args['--jobs']));
const json = `${JSON.stringify(report, null, 2)}\n`;
if (args['--output']) await writeFile(args['--output'], json);
else process.stdout.write(json);
if (process.env.GITHUB_STEP_SUMMARY) {
    const first = report.firstDebuggerVerdict;
    await writeFile(process.env.GITHUB_STEP_SUMMARY,
        `### CI cost and debugger latency\n\n` +
        `- Runner time: ${report.runnerMinutes} min (${report.billedRunnerMinutes} billed job-minutes)\n` +
        `- First debugger verdict: ${first ? `${(first.millisecondsFromRunCreation / 1000).toFixed(1)} s — ${first.step || first.job}` : 'not observed'}\n` +
        `- Complete input: ${report.counts.jobs} jobs, ${report.counts.steps} steps, ${report.counts.windows} bounded windows\n`,
        {flag: 'a'});
}
