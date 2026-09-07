#!/usr/bin/env node
/**
 * Every RELATIVE interactivity limit inside a browser gate is derived from
 * measurement, never typed (plan T15; T12's shape for the gates' own thresholds).
 *
 * Measured 2026-09-07 over 26 completed main runs: the Sounds tab's 150 ms sat
 * 1.1× above its p95 (135.7) on a runner whose own spread is p95/p50 = 1.05 —
 * two red main runs in one day were the runner, not the code; the Costume
 * ceiling (baseline + 15 % = 449.075) sat exactly AT its p95 (449.0) and had
 * been quarantined to advisory for it; the P21 importer's 279.2 was 1.84× p95.
 *
 *   node scripts/gen-timing-limits.mjs --fetch   download each gate's receipt from the last
 *                                                RUNS green main runs (gh run download) and
 *                                                REWRITE docs/generated/browser-timing-readings.json
 *   node scripts/gen-timing-limits.mjs           apply the readings: rewrite each gate's
 *                                                `const relativeLimitMs = N;` with the derivation
 *   node scripts/gen-timing-limits.mjs --check   exit 1 if a gate's literal disagrees
 *
 * THE DERIVATION: limit = ceil(p95(last KEEP green readings) × FACTOR), FACTOR 1.5.
 * The p95 over the last runs IS the runner's speed, measured on the runner class
 * the gate runs on; 1.5× a spread of ~6 % catches a 50 % regression and never
 * fires on the spread. Fewer than MIN_READINGS readings → PROVISIONAL (the
 * literal stays, the comment says so and gives the count). The 1000 ms
 * absolutes (stall detectors), the 100 ms long-task ceilings (a claim about
 * the code: input blocked) and the 8086's simulated-time budget are NOT
 * derived — they are recorded in the readings so the next reader sees the
 * margin, and left typed.
 */
import {readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const READINGS = path.join(ROOT, 'docs', 'generated', 'browser-timing-readings.json');
export const FACTOR = 1.5, MIN_READINGS = 5, KEEP = 20, RUNS = 30;

/** The metrics: where the gate keeps its literal, which artifact holds the reading, and how to read it. */
export const METRICS = [
    {id: 'sounds-tab-interactivity', script: 'scripts/verify-sound-tab-activation.mjs', artifact: 'sound-tab-activation', file: 'receipt.json', read: r => r.durationMs,
        typed: r => ({absoluteLimitMs: r.absoluteLimitMs, maxLongTaskMs: r.maxLongTaskMs, longestTaskMs: Math.max(0, ...(r.longTasks || []).map(t => t.ms ?? 0))})},
    {id: 'costume-first-interactivity', script: 'scripts/verify-costume-roundtrip.mjs', artifact: 'costume-roundtrip-proof', file: 'paint-performance.json', read: r => r.durationMs,
        typed: r => ({absoluteLimitMs: r.absoluteLimitMs, maxLongTaskMs: r.maxLongTaskMs, longestTaskMs: Math.max(0, ...(r.activationLongTasks || []).map(t => t.ms ?? 0))})},
    {id: 'p21-importer-activation-median', script: 'scripts/verify-pseudocode-importer-activation.mjs', artifact: 'pseudocode-importer-activation', file: 'receipt.json', read: r => r.medianMs,
        typed: r => ({absoluteLimitMs: r.absoluteLimitMs, maxLongTaskMs: r.maxLongTaskMs, maxSampleMs: Math.max(...(r.samples || []).map(s => s.durationMs))})}
];

export const p95 = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]; };

/** The derivation for one metric. Pure. */
export const derive = (entry, literal) => {
    const vals = ((entry && entry.readings) || []).map(r => r.ms).filter(Number.isFinite);
    const max = entry && entry.max ? entry.max : null;
    if (vals.length < MIN_READINGS) return {provisional: true, n: vals.length, limit: literal, p95: vals.length ? p95(vals) : null, max};
    const p = p95(vals);
    return {provisional: false, n: vals.length, p95: p, limit: Math.ceil(p * FACTOR), max};
};
export const commentFor = (d, newestRun) => d.provisional
    ? `// PROVISIONAL — ${d.n} reading(s), fewer than ${MIN_READINGS}; derived once ${MIN_READINGS} green runs exist (gen-timing-limits.mjs)`
    : `// derived: p95 ${d.p95.toFixed(1)} ms × ${FACTOR} → ${d.limit} ms over ${d.n} green runs to ${newestRun}${d.max ? `; max ${d.max.ms.toFixed(1)} ms in run ${d.max.run}` : ''} (gen-timing-limits.mjs)`;

const LITERAL = /^(const relativeLimitMs = )([0-9.]+)(;.*)?$/m;

/** Rewrite one script's literal from the readings. Pure over text; returns {text, change}. */
export const applyToScript = (text, entry, newestRun) => {
    const m = text.match(LITERAL);
    if (!m) return {text, change: null, missing: true};
    const d = derive(entry, Number(m[2]));
    const line = `${m[1]}${d.limit}; ${commentFor(d, newestRun)}`;
    const next = text.replace(LITERAL, line);
    return {text: next, change: next === text ? null : `${m[2]} → ${d.limit}${d.provisional ? ' (provisional)' : ''}`};
};

const gh = args => execFileSync('gh', args, {encoding: 'utf8', maxBuffer: 64 << 20});
export const fetchReadings = previous => {
    const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
    const runs = JSON.parse(gh(['run', 'list', '--repo', repo, '--branch', 'main', '--workflow', 'build.yml', '--status', 'success', '--limit', String(RUNS), '--json', 'databaseId,headSha,createdAt']));
    const tmp = mkdtempSync(path.join(tmpdir(), 'timing-readings-'));
    const metrics = {};
    for (const m of METRICS) metrics[m.id] = {script: m.script, artifact: m.artifact, readings: [], typed: null, max: (previous && previous.metrics && previous.metrics[m.id] && previous.metrics[m.id].max) || null};
    for (const r of runs) {
        for (const m of METRICS) {
            const e = metrics[m.id];
            if (e.readings.length >= KEEP) continue;
            const dir = path.join(tmp, String(r.databaseId), m.artifact);
            try { gh(['run', 'download', String(r.databaseId), '--repo', repo, '-n', m.artifact, '-D', dir]); } catch { continue; } // a run without the artifact is not a reading
            const file = path.join(dir, m.file);
            if (!existsSync(file)) continue;
            const receipt = JSON.parse(readFileSync(file, 'utf8'));
            const ms = m.read(receipt);
            if (!Number.isFinite(ms)) continue;
            e.readings.push({run: r.databaseId, sha: r.headSha.slice(0, 9), ms});
            if (!e.typed) e.typed = m.typed(receipt);
            if (!e.max || ms > e.max.ms) e.max = {ms, run: r.databaseId, sha: r.headSha.slice(0, 9)};
        }
    }
    rmSync(tmp, {recursive: true, force: true});
    for (const e of Object.values(metrics)) e.p95 = e.readings.length ? p95(e.readings.map(r => r.ms)) : null;
    return {generatedAt: new Date().toISOString(), repo, branch: 'main', newestRun: runs[0] && runs[0].databaseId, runsScanned: runs.length, keepPerMetric: KEEP, factor: FACTOR, minReadings: MIN_READINGS, metrics};
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    if (process.argv.includes('--fetch')) {
        let previous = null;
        try { previous = JSON.parse(readFileSync(READINGS, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        const r = fetchReadings(previous);
        writeFileSync(READINGS, JSON.stringify(r, null, 1) + '\n');
        for (const [id, e] of Object.entries(r.metrics)) console.log(`  ${id}: ${e.readings.length} reading(s), p95 ${e.p95 && e.p95.toFixed(1)} ms, max ${e.max && e.max.ms.toFixed(1)} ms (run ${e.max && e.max.run})`);
        console.log(`readings written to ${path.relative(ROOT, READINGS)} (newest run ${r.newestRun})`);
    }
    const readings = JSON.parse(readFileSync(READINGS, 'utf8'));
    const changes = [];
    for (const m of METRICS) {
        const file = path.join(ROOT, m.script);
        const text = readFileSync(file, 'utf8');
        const {text: next, change, missing} = applyToScript(text, readings.metrics[m.id], readings.newestRun);
        if (missing) { console.log(`::error::${m.script}: no \`const relativeLimitMs = N;\` line to derive`); changes.push(`${m.id}: literal missing`); continue; }
        if (change) { changes.push(`${m.id}: ${change}`); if (!process.argv.includes('--check')) writeFileSync(file, next); }
    }
    for (const c of changes) console.log(`  ${process.argv.includes('--check') ? 'would change ' : ''}${c}`);
    if (process.argv.includes('--check')) {
        if (changes.length) { console.error(`${changes.length} gate literal(s) disagree with the readings — run node scripts/gen-timing-limits.mjs`); process.exit(1); }
        console.log('every relative limit agrees with docs/generated/browser-timing-readings.json');
    } else console.log(`${changes.length} literal(s) rewritten`);
}
