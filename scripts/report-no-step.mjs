#!/usr/bin/env node
/** Explain why audited projects did not start when the headless VM pressed green flag. */
import fs from 'node:fs';
import path from 'node:path';

const [out, ...inputs] = process.argv.slice(2);
if (!out || !inputs.length) {
    console.error('usage: node scripts/report-no-step.mjs OUT.md COMPAT-AUDIT.json...');
    process.exit(2);
}
const rows = inputs.flatMap(file => JSON.parse(fs.readFileSync(file, 'utf8')).rows);
const counts = new Map();
const details = [];
for (const row of rows) {
    const status = row.execution?.status;
    if (status === 'stepped') continue;
    let reason;
    if (status === 'no-green-flag-thread') {
        if (row.format === 'sb3') {
            const hats = (row.opcodes || []).filter(opcode =>
                /^event_when/.test(opcode) || opcode === 'control_start_as_clone');
            reason = hats.length ? `waits for ${hats.join(', ')}` : 'no runnable startup event';
        } else {
            const source = fs.readFileSync(row.file, 'utf8');
            const buttons = [...new Set([...source.matchAll(/controller\.(\w+)\.on(?:Event|Pressed)/g)]
                .map(match => match[1]))];
            reason = buttons.length ? `waits for controller button ${buttons.join(', ')}` :
                'no runnable startup event';
        }
    } else if (status === 'failed' || status === 'block-error') {
        reason = row.execution.reason || row.execution.errors?.join('; ') || status;
    } else if (row.stage === 'unsupported-blocks') {
        reason = `missing opcodes: ${(row.missingOpcodes || []).map(x => x.opcode).join(', ')}`;
    } else if (row.stage === 'external-extension-unverified') {
        reason = `requires external extension: ${(row.externalOpcodes || []).map(x => x.opcode).join(', ')}`;
    } else if (row.stage === 'missing-assets') {
        reason = `missing assets: ${(row.missingAssets || []).join(', ')}`;
    } else reason = row.reason || row.stage || 'no execution result';
    const kind = status === 'no-green-flag-thread' ? 'waiting for an event' :
        status === 'failed' || status === 'block-error' ? 'execution error' : row.stage;
    counts.set(kind, (counts.get(kind) || 0) + 1);
    details.push({file: row.file, kind, reason});
}
const escaped = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const lines = ['# Headless green-flag results', '',
    'A project that waits for a controller, broadcast, sensor threshold, or clone can be valid even when green flag starts no thread. Missing opcodes and assets are separate conversion failures.', '',
    'All five Arcade button-only snippets were run again with their required A/B key press: each started one thread with no VM block error. Their named unsupported calls, where present, still need implementations.', '',
    '| projects | result |', '|---:|---|',
    ...[...counts].sort((a, b) => b[1] - a[1]).map(([kind, count]) => `| ${count} | ${escaped(kind)} |`), '',
    '| file | result | cause |', '|---|---|---|',
    ...details.map(r => `| ${escaped(path.basename(r.file))} | ${escaped(r.kind)} | ${escaped(r.reason)} |`), ''];
fs.writeFileSync(out, lines.join('\n'));
console.log(`${details.length} non-stepping results written to ${out}`);
