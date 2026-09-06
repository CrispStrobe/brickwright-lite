#!/usr/bin/env node
/**
 * Preflight for the npm test scripts: refuse, by name, to run the suite on a
 * Node older than package.json's `engines.node`.
 *
 * Why this exists: the repo needs Node 22 (fs.globSync, import.meta.dirname,
 * the test runner's per-file reporters) and CI runs 22, but this VPS runs 20.
 * Every measurement mistake of 2026-09-06 that was not the stale checkout was
 * a suite run on Node 20 reporting something Node 22 would not. A wrong Node
 * should fail loudly before the first test, not partway through with an
 * unrelated-looking error.
 *
 * Scope: ONLY the npm scripts (`npm test`, `npm run test:fast`, `test:corpus`)
 * run this first. A single-file `node --test test/x.test.mjs` is untouched —
 * the fleet uses those on this box deliberately.
 *
 * Node ≥ floor: prints nothing, exit 0. Below: one sentence + install hint on
 * stderr, exit 2 (distinct from a test failure's 1).
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** The lowest major that satisfies an engines range like ">=22", "22.x", "^22.0.0", ">=22 <25". */
export const floorMajor = range => {
    const m = /(\d+)/.exec(String(range || ''));
    return m ? Number(m[1]) : NaN;
};

/**
 * Pure verdict, so the tests can exercise both branches on any Node.
 * @returns {{ok: boolean, message: string}}
 */
export const judge = (nodeVersion, range) => {
    const floor = floorMajor(range);
    const major = Number(String(nodeVersion).replace(/^v/, '').split('.')[0]);
    if (!Number.isFinite(floor)) return {ok: true, message: ''};
    if (major >= floor) return {ok: true, message: ''};
    return {
        ok: false,
        message: `This repo's test suite needs Node ${floor} or newer (package.json engines "${range}": fs.globSync, import.meta.dirname, per-file test reporters), and this is Node ${String(nodeVersion).replace(/^v/, '')} — not running it, because the readings would not be CI's.\n` +
            `Install: \`nvm install 22 && nvm use\` (the repo's .nvmrc says 22), or \`sudo n 22\`. A single file still runs on any Node with \`node --test test/<name>.test.mjs\`; only the npm test scripts are gated.`
    };
};

const isMain = process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].split('/').pop());
if (isMain) {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const verdict = judge(process.version, pkg.engines && pkg.engines.node);
    if (!verdict.ok) {
        console.error(`check-node: ${verdict.message}`);
        process.exit(2);
    }
}
