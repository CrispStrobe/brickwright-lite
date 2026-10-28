#!/usr/bin/env node
/**
 * Nightly: compare the committed hosted-targets.json snapshot against the LIVE
 * stc-compiler service, and REPORT drift — never fail the build.
 *
 * The snapshot is derived from a stc-compiler CHECKOUT (gen-hosted-targets.mjs);
 * this asks the DEPLOYED service what it actually serves, via GET /health, which
 * reports its target lists. The two can differ two ways, and both are worth a
 * human's eye without being a red build:
 *   - a target is in the snapshot but NOT live — the deploy is behind the source,
 *     OR a toolchain bundle (avr, arm) is not present in this deployment, which
 *     /health reports as an empty list rather than an error.
 *   - a target is LIVE but not in the snapshot — the owner deployed something new
 *     and the pinned snapshot is now stale; refresh it with gen-hosted-targets.
 *
 * A network failure is neither agreement nor disagreement: it is reported as
 * "could not compare", and the step still exits 0. Plan T2, the live half.
 *
 * /health does not report the 6502/eater compile list, so that one family is
 * noted as un-compared rather than silently treated as empty.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const snapshotPath = path.join(root, 'docs/generated/hosted-targets.json');

export const HEALTH_URL = 'https://stc-compiler.vercel.app/health';
export const TIMEOUT_MS = 15000;

/** Which /health field reports each snapshot family, and whether /health carries
 *  it at all. Keyed by "<scope>.<family>". */
const HEALTH_FIELD = {
    'compile.8051': {get: h => Object.keys(h.targets || {})},
    'compile.avr': {get: h => Object.keys(h.avr_targets || {})},
    'compile.arm': {get: h => Object.keys(h.arm_targets || {})},
    'compile.6502': {get: null, note: '/health does not report the 6502 compile list'}
};

/**
 * Compare a snapshot object against a parsed /health body. Returns rows:
 * {scope, family, onlySnapshot:[...], onlyLive:[...], note?}. Pure — no I/O — so
 * the test drives it with a fixture body.
 */
export function compare (snapshot, health) {
    const rows = [];
    const diff = (scope, family, snap, live) => {
        const s = new Set(snap), l = new Set(live);
        rows.push({
            scope, family,
            onlySnapshot: [...snap].filter(x => !l.has(x)).sort(),
            onlyLive: [...live].filter(x => !s.has(x)).sort()
        });
    };
    for (const family of Object.keys(snapshot.compile || {})) {
        const field = HEALTH_FIELD[`compile.${family}`];
        if (field && field.get === null) { rows.push({scope: 'compile', family, note: field.note}); continue; }
        if (!field) { rows.push({scope: 'compile', family, note: `no /health field mapped for compile.${family}`}); continue; }
        diff('compile', family, snapshot.compile[family] || [], field.get(health));
    }
    // assemble is one flat list on both sides.
    diff('assemble', '(all families)',
        Object.values(snapshot.assemble || {}).flat(),
        Array.isArray(health.assemble_targets) ? health.assemble_targets : []);
    return rows;
}

const clean = rows => rows.every(r => r.note || (!r.onlySnapshot.length && !r.onlyLive.length));

/** Markdown for the job summary / stdout. */
export function renderSummary (result) {
    const lines = ['## Hosted service targets — snapshot vs live `/health`', ''];
    if (result.error) {
        lines.push(`**Could not compare** — ${result.error}.`,
            'The live service was not reached; this is neither agreement nor disagreement.');
        return lines.join('\n') + '\n';
    }
    lines.push(`Snapshot sha \`${result.snapshotSha.slice(0, 8)}\` · live version \`${result.liveVersion || 'unknown'}\` · ${result.url}`, '');
    if (clean(result.rows)) {
        lines.push('The live service matches the snapshot on every target list `/health` reports.');
    } else {
        lines.push('| scope | family | only in snapshot (behind deploy / bundle absent) | only live (snapshot stale) |',
            '| --- | --- | --- | --- |');
        for (const r of result.rows) {
            if (r.note) { lines.push(`| ${r.scope} | ${r.family} | _${r.note}_ | |`); continue; }
            if (!r.onlySnapshot.length && !r.onlyLive.length) continue;
            lines.push(`| ${r.scope} | ${r.family} | ${r.onlySnapshot.join(', ') || '—'} | ${r.onlyLive.join(', ') || '—'} |`);
        }
        lines.push('', 'This is a report, not a failure. If a target is only live, refresh the snapshot '
            + 'with `node scripts/gen-hosted-targets.mjs --dir <stc-compiler>`; if only in the snapshot, the deploy is behind or a bundle is absent.');
    }
    // The un-compared families, always stated so the report never reads as total.
    const noted = result.rows.filter(r => r.note).map(r => `${r.scope}.${r.family}`);
    if (noted.length) lines.push('', `Not compared (not in \`/health\`): ${noted.join(', ')}.`);
    return lines.join('\n') + '\n';
}

async function fetchHealth (url, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {signal: ctrl.signal, headers: {accept: 'application/json'}});
        if (!res.ok) return {error: `HTTP ${res.status} from ${url}`};
        return {health: await res.json()};
    } catch (e) {
        return {error: e && e.name === 'AbortError' ? `timed out after ${timeoutMs} ms` : (e && e.message) || 'network error'};
    } finally {
        clearTimeout(timer);
    }
}

async function main () {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const got = await fetchHealth(HEALTH_URL, TIMEOUT_MS);
    let result;
    if (got.error) {
        result = {error: got.error};
    } else {
        result = {
            url: HEALTH_URL,
            snapshotSha: (snapshot.source && snapshot.source.sha) || 'unknown',
            liveVersion: got.health && got.health.version,
            rows: compare(snapshot, got.health)
        };
    }
    const md = renderSummary(result);
    process.stdout.write(md);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) { try { fs.appendFileSync(summary, md); } catch { /* summary is best-effort */ } }
    // Report only. Never fail the build.
    process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
