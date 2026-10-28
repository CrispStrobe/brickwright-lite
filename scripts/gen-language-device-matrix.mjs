#!/usr/bin/env node
/**
 * Generate docs/generated/LANGUAGE-DEVICE-MATRIX.md from lib/bw-matrix/capabilities.js.
 *
 * The document is derived, never edited: `--check` fails when the file on disk
 * differs from what the module renders, and test/bw-matrix-doc.test.mjs runs
 * that check in CI. Plan: docs/LANGUAGE-DEVICE-MATRIX-PLAN.md, task T3.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    SCHEMA_VERSION, LANGUAGES, DEVICES, CELLS, REASONS, STATUS, EVIDENCE, TIERS,
    cell, overall, isNativeNull
} from '../overlay/scratch-gui/src/lib/bw-matrix/capabilities.js';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'docs/generated/LANGUAGE-DEVICE-MATRIX.md');
const rel = p => path.relative(root, p).replaceAll(path.sep, '/');

// T6: the bw-board oracle census at the pinned sha. A `needs` name is a census
// row id; the row says whether CI runs the oracle (standing) or it was measured
// once on a box (recorded), or is absent. Rendered beside every tier so a reader
// can tell a 2a that CI re-verifies from one that rests on a dark oracle.
const census = JSON.parse(fs.readFileSync(path.join(root, 'docs/generated/bw-board-census.json'), 'utf8'));
const censusRow = id => census.rows.find(r => r.id === id);
const needsText = f => {
    if (!f || !Array.isArray(f.needs) || !f.needs.length) return '';
    return ' · needs ' + f.needs.map(id => {
        const r = censusRow(id);
        if (!r) return `${id} (NO CENSUS ROW)`;
        if (r.kind === 'service') return `${id} (service, ${r.ciAvailable ? 'standing' : 'reachability only'})`;
        return `${id} (${r.ciAvailable ? 'standing' : r.present ? 'recorded' : 'absent'})`;
    }).join(', ');
};

const label = id => (LANGUAGES.find(l => l.id === id) || {label: id}).label;
const reach = r => (r.sim && r.silicon ? 'sim + silicon' : r.sim ? 'sim' : r.silicon ? 'silicon' : 'no reach');
const tasksOf = c => [...new Set([c.native, ...c.lowered].filter(x => x && x.status === STATUS.OPEN && x.task).map(x => x.task))];

function cellText (c) {
    if (!c) return '·';
    const bits = [];
    if (!isNativeNull(c.native) && c.native.status === STATUS.SHIPPED) {
        bits.push(`**N** ${c.native.toolchain} (${c.native.where}) · ${reach(c.native)} · tier ${c.native.tier}${needsText(c.native)}`);
    }
    const shippedLowered = c.lowered.filter(l => l.status === STATUS.SHIPPED);
    if (shippedLowered.length) {
        const vias = [...new Set(shippedLowered.map(l => label(l.via)))].join(', ');
        const r = {sim: shippedLowered.some(l => l.sim), silicon: shippedLowered.some(l => l.silicon)};
        bits.push(`**L** via ${vias} · ${reach(r)}`);
    }
    if (isNativeNull(c.native) && c.native.reason !== 'is-ast') {
        bits.push(`native — (${c.native.reason}: ${c.native.cite})`);
    }
    const open = tasksOf(c);
    if (open.length) bits.push(`open: ${open.join(', ')}`);
    const declared = [c.native, ...c.lowered].some(x => x && !isNativeNull(x) && x.evidence === EVIDENCE.DECLARED && x.status === STATUS.SHIPPED);
    if (declared) bits.push('_declared_');
    return bits.join('<br>');
}

export function buildLanguageDeviceMatrix () {
    const rows = overall();
    const families = [];
    for (const r of rows) if (!families.some(d => d.family === r.device.family)) families.push(r.device);
    const head = `| language ↓ / device → | ${families.map(d => d.group === d.label ? d.label : `${d.group}<br>_${d.label}${rows.filter(r => r.device.family === d.family).length > 1 ? ' and kin' : ''}_`).join(' | ')} |`;
    const sep = `| --- | ${families.map(() => '---').join(' | ')} |`;
    const body = LANGUAGES.map(l => `| **${l.label}**${l.reader ? (l.readerNote ? ` (reader: ${l.readerNote}; ${l.readerTask})` : '') : ` (no reader: ${l.readerTask})`} | ${families.map(d => cellText(cell(l.id, d.id))).join(' | ')} |`);

    const devRows = DEVICES.map(d => {
        const sims = d.sim.map(e => `${e.engine} [${e.runs.join(',')}]${e.status === STATUS.OPEN ? ' (open)' : ''} · tier ${e.tier}${needsText(e)}`).join('<br>') || '—';
        const sil = d.silicon.map(t => `${t.transport} [${t.accepts.join(',')}]${t.status === STATUS.OPEN ? ` (open${t.task ? `: ${t.task}` : ''})` : ''}`).join('<br>') || '—';
        const over = d.overrides ? Object.entries(d.overrides).map(([lang, o]) => `${lang}: ${o.where}${o.note ? ` — ${o.note}` : ''}`).join('<br>') : '';
        return `| ${d.id} | ${d.group} | ${d.programmable === false ? 'console, not programmable' : d.family} | ${sims} | ${sil} | ${over} |`;
    });

    const opens = new Map();
    for (const r of rows) for (const c of r.cells) for (const t of tasksOf(c)) opens.set(t, [...(opens.get(t) || []), `${c.language.id}/${c.device.id}`]);
    const openRows = [...opens.entries()].sort().map(([t, cells]) => `| ${t} | ${cells.length} | ${cells.join(', ')} |`);

    const nulls = [];
    for (const r of rows) for (const c of r.cells) if (isNativeNull(c.native) && c.native.reason !== 'is-ast') nulls.push(`| ${c.language.label} | ${c.device.id} | ${c.native.reason} | ${c.native.cite} |`);

    const tierRows = Object.entries(TIERS).map(([k, v]) => `| ${k} | ${v} |`);
    const referenced = new Set();
    for (const d of DEVICES) for (const f of [...d.sim, ...d.silicon]) for (const id of f.needs || []) referenced.add(id);
    for (const langs of Object.values(CELLS)) for (const c of Object.values(langs)) for (const f of [c.native, ...(c.lowered || [])]) for (const id of (f && f.needs) || []) referenced.add(id);
    const referencedRows = census.rows.filter(r => referenced.has(r.id));

    return `# Language × device matrix

> Generated by \`scripts/gen-language-device-matrix.mjs\` from
> \`overlay/scratch-gui/src/lib/bw-matrix/capabilities.js\` (schema v${SCHEMA_VERSION}).
> Do not edit; run \`npm run gen:matrix\`. \`npm run gen:matrix:check\` fails when this file is stale.
> Plan, task ids and decisions: \`docs/LANGUAGE-DEVICE-MATRIX-PLAN.md\`.

A cell is **N** native (the language itself runs on the chip), **L** lowered (read into the
dialect AST and re-emitted as something the chip runs natively), or both. Reach is computed
from the device's shipped engines and transports, never typed per cell. _declared_ marks a
shipped fact no gate in this repository re-derives from source. \`tier\` is the verification
tier of the capability itself (bw-board \`VERIFICATION.md\` vocabulary), which is a different
question from whether the row agrees with the code.

## The matrix (one column per chip family)

${head}
${sep}
${body.join('\n')}

## Devices: simulator engines and silicon transports

| device | group | family | simulator runs | silicon accepts | overrides |
| --- | --- | --- | --- | --- | --- |
${devRows.join('\n')}

## Open tasks, by cell

| task | cells | which |
| --- | --- | --- |
${openRows.join('\n')}

## Native halves that are physically out, with the number each rests on

| language | device | reason | cite |
| --- | --- | --- | --- |
${nulls.join('\n')}

## Oracles the tiers rest on (bw-board census at the pinned sha)

Joined from \`docs/generated/bw-board-census.json\` (bw-board \`${census.source.sha.slice(0, 9)}\`, read ${census.source.read}).
**standing** = bw-board's CI runs the oracle on every push (the census reports bw-board's gates only — a cell whose
standing check lives in lite's own CI, like the labwired heavy tier, says so in its row); **recorded** = measured once
on the box the census was read on; **absent** = not present there; a **service** row is reachability, never probed.
The last column is bw-board's description AS AUTHORED: a stable string, not a re-measured fact.

| census id | kind | status in bw-board's CI | gates in bw-board | what (as authored) |
| --- | --- | --- | --- | --- |
${referencedRows.map(r => `| ${r.id} | ${r.kind} | ${r.kind === 'service' ? (r.ciAvailable ? 'standing' : 'reachability only') : r.ciAvailable ? 'standing' : r.present ? 'recorded' : 'absent'} | ${r.gates.join('<br>')} | ${String(r.what).split('.')[0]}. |`).join('\n')}

## Verification tiers used above

| tier | meaning |
| --- | --- |
${tierRows.join('\n')}

Reasons vocabulary: ${Object.keys(REASONS).join(', ')}.
`;
}

export function checkLanguageDeviceMatrix () {
    const expected = buildLanguageDeviceMatrix();
    const actual = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
    if (actual !== expected) throw new Error(`${rel(output)} is stale; run npm run gen:matrix`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes('--check')) {
        checkLanguageDeviceMatrix();
        console.log(`${rel(output)} is current`);
    } else {
        fs.mkdirSync(path.dirname(output), {recursive: true});
        fs.writeFileSync(output, buildLanguageDeviceMatrix());
        console.log(`wrote ${rel(output)}`);
    }
}
