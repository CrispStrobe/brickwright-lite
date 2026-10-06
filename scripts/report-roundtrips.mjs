#!/usr/bin/env node
/** Summarize the machine-readable conversion round-trip report. */
import fs from 'node:fs';
import path from 'node:path';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
    console.error('usage: node scripts/report-roundtrips.mjs REPORT.json OUTPUT.md');
    process.exit(2);
}
const report = JSON.parse(fs.readFileSync(input, 'utf8'));
const rows = report.rows;
const paths = ['project -> bw -> project', 'makecode -> bw -> sb3 -> bw -> project',
    'makecode -> bw -> makecode -> bw'];
const tally = rows => Object.fromEntries(paths.map(label => [label, rows.reduce((acc, row) => {
    const p = row.paths?.find(x => x.label === label);
    if (!p) return acc;
    const hasLoss = p.binaryAssetsNotRepresented || Object.values(p.differences || {}).some(x => x.length);
    const hasUnsupported = row.importUnsupported?.length || p.exportUnsupported?.length ||
        p.importUnsupported?.length;
    const status = p.error ? 'error' : p.compile?.status === 'fail' ? 'compile fail' :
        p.compile?.status === 'source-invalid' ? 'source invalid' :
        hasLoss ? 'loss' : hasUnsupported ? 'partial' : 'preserved';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
}, {})]));
const escape = s => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
const lines = ['# Conversion round trips', '',
    `Generated ${report.generatedAt}; ${rows.length} inputs. “Preserved” means the measured structure and Arcade image pixels match and no converter reported an unsupported element. It does not prove program behavior. “Source invalid” is a re-export MakeCode rejects whose original MakeCode itself rejects too (a documentation snippet with an undeclared name or a missing package).`, '',
    '## Paths', '', '| corpus | permutation | preserved | partial | loss | compile fail | source invalid | error |',
    '|---|---|---:|---:|---:|---:|---:|---:|'];
for (const [name, chosen] of [
    ['Arcade TypeScript', rows.filter(r => r.target === 'arcade')],
    ['micro:bit TypeScript', rows.filter(r => r.target === 'microbit')],
    ['TurboWarp SB3', rows.filter(r => r.format === 'sb3')]
]) {
    for (const [label, counts] of Object.entries(tally(chosen))) {
        if (!Object.keys(counts).length) continue;
        lines.push(`| ${name} | ${label} | ${counts.preserved || 0} | ${counts.partial || 0} | ${counts.loss || 0} | ${counts['compile fail'] || 0} | ${counts['source invalid'] || 0} | ${counts.error || 0} |`);
    }
}
const lost = new Map();
const unsupported = new Map();
const failures = [];
for (const row of rows) {
    const reverse = row.paths?.find(x => x.label === 'makecode -> bw -> makecode -> bw');
    for (const x of reverse?.differences?.lostOpcodes || []) lost.set(x.name, (lost.get(x.name) || 0) + 1);
    for (const x of reverse?.exportUnsupported || []) unsupported.set(x, (unsupported.get(x) || 0) + 1);
    if (row.error || row.status === 'failed' || reverse?.error || reverse?.compile?.status === 'fail') {
        failures.push([row.file, row.error || reverse?.error || reverse?.compile?.diagnostics?.[0] || reverse?.compile?.error]);
    }
}
const table = m => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 40).map(([name, n]) => `| ${n} | ${escape(name)} |`);
lines.push('', '## Most often lost block opcodes on reverse MakeCode conversion', '',
    '| projects | opcode |', '|---:|---|', ...table(lost), '',
    '## Most often named unsupported on reverse MakeCode conversion', '',
    '| projects | element |', '|---:|---|', ...table(unsupported), '',
    '## Failed source parses or MakeCode recompiles', '', '| file | reason |', '|---|---|',
    ...failures.map(([file, reason]) => `| ${escape(path.basename(file))} | ${escape(reason)} |`), '');
fs.writeFileSync(output, lines.join('\n'));
console.log(`${rows.length} inputs summarized in ${output}`);
