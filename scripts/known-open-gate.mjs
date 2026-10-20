#!/usr/bin/env node
// known-open-gate.mjs <gate-id> <exit-status>
// Judge one browser gate's exit status against scripts/lib/browser-known-open.json.
// - not listed: return the gate's own status, unchanged.
// - listed and failed: report known-open (with its reason and doc) and pass.
// - listed and passed: fail, because the entry is stale and must be removed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [id, rawStatus] = process.argv.slice(2);
const status = Number(rawStatus);
if (!id || !Number.isInteger(status)) {
    console.error('usage: known-open-gate.mjs <gate-id> <exit-status>');
    process.exit(2);
}
const list = JSON.parse(fs.readFileSync(path.join(root, 'scripts/lib/browser-known-open.json'), 'utf8'));
const entry = Object.hasOwn(list, id) && id !== '$comment' ? list[id] : null;
if (!entry) process.exit(status);
if (typeof entry.reason !== 'string' || !entry.reason || typeof entry.doc !== 'string' ||
    !/^docs\/[A-Za-z0-9._/-]+\.md$/.test(entry.doc) || !fs.existsSync(path.join(root, entry.doc))) {
    console.error(`::error::known-open entry ${id} needs a reason and an existing docs/….md`);
    process.exit(1);
}
if (status === 0) {
    console.error(`::error::browser gate ${id} PASSED but is listed as known-open — remove its entry from scripts/lib/browser-known-open.json and ${entry.doc}`);
    process.exit(1);
}
// Only the documented assertion is known-open; any other failure stays a failure.
let failure = '';
try { failure = String(JSON.parse(fs.readFileSync(path.join(root, entry.report), 'utf8')).failure || ''); } catch {}
if (typeof entry.failure !== 'string' || !failure.startsWith(entry.failure)) {
    console.error(`::error::browser gate ${id} failed differently from its known-open entry (${entry.failure}): ${failure.split('\n')[0] || 'no report'}`);
    process.exit(status);
}
console.log(`::warning::browser gate ${id} is KNOWN-OPEN (exit ${status}): ${entry.reason} — see ${entry.doc}`);
process.exit(0);
