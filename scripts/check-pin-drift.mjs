#!/usr/bin/env node
// Nightly freshness NOTICE: warn when a sha-pinned npm upstream (bw-board,
// bw-circuit-ui) has drifted behind its master. Nothing here fails — bumping a
// pin is a deliberate, tested act (scripts/pin-packages.mjs) — but a pin that
// silently lags is exactly how bw-circuit-ui's regenerated sidecar index
// (registering tang_nano_20k) sat on master while Lite's FPGA demo board stayed
// electrically dead. vendor-freshness owns the copied sb3-creator transform and
// build.yml verifies the pinned payloads; neither notices a pin falling behind.
// This closes that gap with a visible warning, never a red gate.
import {readFileSync, appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pins = JSON.parse(readFileSync(join(root, 'vendor-pins.json'), 'utf8'));
const REPOS = {'bw-board': 'CrispStrobe/bw-board', 'bw-circuit-ui': 'CrispStrobe/bw-circuit-ui'};
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const headers = {accept: 'application/vnd.github+json', 'user-agent': 'brickwright-pin-drift',
    ...(token ? {authorization: `Bearer ${token}`} : {})};

let behind = 0;
const summary = [];
for (const [pkg, repo] of Object.entries(REPOS)) {
    const pin = pins[pkg];
    if (!pin || !/^[0-9a-f]{40}$/.test(pin)) { console.log(`skip ${pkg}: no 40-hex pin in vendor-pins.json`); continue; }
    try {
        // compare/base...head: base=pin, head=master. `ahead_by` counts commits
        // master has beyond the pin — i.e. how far the pin is BEHIND.
        const res = await fetch(`https://api.github.com/repos/${repo}/compare/${pin}...master`, {headers});
        if (!res.ok) { console.log(`::warning::${pkg}: could not compare pin to master (HTTP ${res.status}) — skipping (API/network, not a pin problem)`); continue; }
        const d = await res.json();
        const by = d.ahead_by || 0;
        if (by > 0) {
            behind++;
            const masterSha = (d.commits && d.commits.length ? d.commits[d.commits.length - 1].sha : '').slice(0, 10) || '?';
            const msg = `${pkg} pin is ${by} commit(s) behind ${repo}@master (pinned ${pin.slice(0, 10)}, master ${masterSha}). Review the diff and bump with scripts/pin-packages.mjs when ready.`;
            console.log(`::warning::${msg}`);
            summary.push(`- ⚠️ ${msg}`);
        } else {
            console.log(`ok ${pkg}: pin is current with master`);
            summary.push(`- ✅ ${pkg}: current with master`);
        }
    } catch (e) {
        console.log(`::warning::${pkg}: drift check errored (${e.message}) — network/API, not a pin problem`);
    }
}
if (process.env.GITHUB_STEP_SUMMARY && summary.length) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Vendor pin freshness\n${summary.join('\n')}\n`); } catch (e) { /* summary is best-effort */ }
}
console.log(behind
    ? `\n${behind} pin(s) behind upstream master — a freshness notice, not a failure`
    : '\nall sha-pinned upstreams are current with master');
process.exit(0); // NOTICE only: never a hard gate, so a lagging pin never blocks a push
