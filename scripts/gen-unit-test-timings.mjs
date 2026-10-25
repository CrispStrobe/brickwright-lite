#!/usr/bin/env node
/**
 * Regenerate scripts/data/unit-test-timings.json, the per-file timings that
 * scripts/list-tests.mjs balances the unit shards with.
 *
 *   gh run download <run-id> -p 'unit-shard-*' -D <dir>
 *   node scripts/gen-unit-test-timings.mjs <dir> <run-id>
 *
 * Each `unit-shard-N` artifact holds the shard's TAP (`unit.tap`) and its file
 * census (`fast.census.json`). The census is built from the same event stream
 * as the TAP and lists files in first-event order with their event counts, so
 * the TAP's ok/not-ok lines are sliced file by file with those counts. A file's
 * time is the sum of its top-level (nesting 0) test durations. The total event
 * count of each shard must equal its census total, or the reading is refused.
 */
import {readFileSync, readdirSync, writeFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'scripts', 'data', 'unit-test-timings.json');

const find = (dir, name) => {
    for (const entry of readdirSync(dir)) {
        const p = path.join(dir, entry);
        if (statSync(p).isDirectory()) { const hit = find(p, name); if (hit) return hit; }
        else if (entry === name) return p;
    }
    return null;
};

/** Per-file seconds from one shard's TAP text and census object. */
export const shardTimings = (tap, census) => {
    const lines = tap.split('\n'), events = [];
    lines.forEach((line, i) => {
        const m = /^( *)(?:not )?ok \d+ - /.exec(line);
        if (!m) return;
        let ms = 0;
        for (let k = i + 1; k < Math.min(i + 8, lines.length); k++) {
            const d = /^ *duration_ms: ([\d.]+)/.exec(lines[k]);
            if (d) { ms = Number(d[1]); break; }
        }
        events.push({depth: m[1].length / 4, ms});
    });
    const entries = Object.entries(census.files);
    const total = entries.reduce((n, [, v]) => n + v.tests, 0);
    if (total !== events.length) throw new Error(`census counts ${total} events, TAP has ${events.length}`);
    const out = {};
    let pos = 0;
    for (const [file, v] of entries) {
        const chunk = events.slice(pos, pos += v.tests);
        out[path.posix.join('test', path.basename(file))] =
            Math.round(chunk.filter(e => e.depth === 0).reduce((s, e) => s + e.ms, 0) / 100) / 10;
    }
    return out;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [dir, run] = process.argv.slice(2);
    if (!dir || !run) { console.error('usage: gen-unit-test-timings.mjs <artifact-dir> <run-id>'); process.exit(2); }
    const seconds = {};
    for (const shard of readdirSync(dir).filter(d => /^unit-shard-\d+$/.test(d)).sort()) {
        const base = path.join(dir, shard);
        Object.assign(seconds, shardTimings(readFileSync(find(base, 'unit.tap'), 'utf8'),
            JSON.parse(readFileSync(find(base, 'fast.census.json'), 'utf8'))));
    }
    const sorted = Object.fromEntries(Object.keys(seconds).sort().map(k => [k, seconds[k]]));
    writeFileSync(OUT, JSON.stringify({source: `Build run ${run}, unit-shard-* artifacts`, seconds: sorted}, null, 1) + '\n');
    console.log(`${Object.keys(sorted).length} files`);
}
