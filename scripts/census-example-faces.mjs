#!/usr/bin/env node
/**
 * Example part-face census: which parts in Lite's circuit examples does the
 * circuit editor draw with its generic module body (a labelled box) or a
 * B22 chip face, rather than a part-specific drawing?
 *
 * Step 1 (this script, `kinds`): list every part kind used by
 * overlay/scratch-gui/examples/<example>/circuit*.json.
 * Step 2 (CI): bw-circuit-ui's own census (scripts/census-part-faces.mjs, at
 * the pinned bw-circuit-ui commit) draws those kinds in the real canvas and
 * writes which face drew each (`generic`, `chips` in its --json).
 * Step 3 (this script, `report`): join the two and list the generic kinds by
 * how many examples use them. A report for choosing the next dedicated
 * faces, not a gate.
 *
 *   node scripts/census-example-faces.mjs kinds  [--examples DIR]           comma list
 *   node scripts/census-example-faces.mjs report --census F [--examples DIR] [--md OUT]
 */
import {readdirSync, readFileSync, writeFileSync, appendFileSync} from 'node:fs';

const [mode] = process.argv.slice(2);
const arg = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const dir = arg('--examples') || new URL('../overlay/scratch-gui/examples/', import.meta.url).pathname;

const uses = new Map(); // kind -> Set(example)
let files = 0, unreadable = 0;
for (const ex of readdirSync(dir, {withFileTypes: true}).filter(d => d.isDirectory()).map(d => d.name)) {
    for (const f of readdirSync(`${dir}/${ex}`).filter(f => /^circuit[^/]*\.json$/.test(f))) {
        files++;
        try {
            for (const p of JSON.parse(readFileSync(`${dir}/${ex}/${f}`, 'utf8')).parts || []) {
                if (typeof p.kind === 'string') (uses.get(p.kind) || uses.set(p.kind, new Set()).get(p.kind)).add(ex);
            }
        } catch {
            unreadable++;
        }
    }
}

if (mode === 'kinds') {
    process.stdout.write([...uses.keys()].sort().join(',') + '\n');
} else if (mode === 'report') {
    const census = JSON.parse(readFileSync(arg('--census'), 'utf8'));
    if (!Array.isArray(census.generic)) {
        console.error('census JSON has no `generic` list: the pinned bw-circuit-ui predates B22');
        process.exit(2);
    }
    const rank = list => list.filter(k => uses.has(k)).map(k => [k, [...uses.get(k)].sort()]).sort((a, b) => b[1].length - a[1].length);
    const generic = rank(census.generic), chips = rank(census.chips || []);
    const lines = [
        '## Example part-face census',
        '',
        `${files} circuit files (${unreadable} unreadable), ${uses.size} part kinds. ` +
            `Generic module body: ${generic.length} kinds; chip face: ${chips.length} kinds.`,
        '',
        '| kind | face | examples | e.g. |',
        '|---|---|---|---|',
        ...generic.map(([k, ex]) => `| ${k} | generic | ${ex.length} | ${ex.slice(0, 3).join(', ')} |`),
        ...chips.map(([k, ex]) => `| ${k} | chip | ${ex.length} | ${ex.slice(0, 3).join(', ')} |`),
        '',
    ];
    const md = lines.join('\n');
    console.log(md);
    if (arg('--md')) writeFileSync(arg('--md'), md);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
} else {
    console.error('usage: census-example-faces.mjs kinds|report ...');
    process.exit(2);
}
