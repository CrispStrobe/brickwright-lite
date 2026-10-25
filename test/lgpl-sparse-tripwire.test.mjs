/**
 * ROADMAP §3.5 item 4: the LGPL sparse-solver family (KLU, CSparse and its
 * derivatives, mathjs's sparse module) can never enter the shipped graph.
 * scripts/lib/lgpl-sparse-tripwire.mjs holds the fingerprints; this runs them
 * over every lockfile and every shipped JS source, and
 * scripts/verify-no-gpl-in-build.mjs runs them over the built bundles.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {contentOffences, lockfileOffences, FAMILY_PACKAGE} from '../scripts/lib/lgpl-sparse-tripwire.mjs';
import {packageSourceRoot} from './helpers/package-source.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The fingerprints are assembled here rather than written out, so this file
// does not itself carry them for a repo-wide grep to find.
const DAVIS = ['Timothy', 'A.', 'Davis'].join(' ');
const MATHJS_ESM_HEADER = `// Copyright (c) 2006-2024, ${DAVIS}, All Rights Reserved.\n`
    + '// SPDX-License-Identifier: LGPL-2.1+\n'
    + '// https://github.com/DrTimothyAldenDavis/SuiteSparse/tree/dev/CSparse/Source\n';
const MATHJS_MINIFIED = 'const vm=he("cs' + 'Amd",["add","multiply","transpose"],(e=>{let{add:t,multiply:r';

test('the fingerprints fire on what mathjs 13 actually ships, ESM and minified', () => {
    assert.ok(contentOffences(MATHJS_ESM_HEADER).length >= 2, 'the ESM header of csAmd.js');
    assert.deepEqual(contentOffences(MATHJS_MINIFIED), ["mathjs's CSparse-derived sparse factories"]);
    assert.deepEqual(lockfileOffences(JSON.stringify({packages: {'': {}, 'node_modules/mathjs': {},
        'node_modules/x/node_modules/@scope/klu-wasm': {}, 'node_modules/mathjs-lite': {}}})),
    ['node_modules/mathjs', 'node_modules/x/node_modules/@scope/klu-wasm', 'node_modules/mathjs-lite']);
});

test('...and not on a licence note that names the family, or on other LGPL code', () => {
    const own = readFileSync(path.join(packageSourceRoot('bw-board'), 'sparse.js'), 'utf8');
    assert.match(own, /CSparse/, 'bw-board sparse.js no longer names CSparse; pick another negative control');
    assert.deepEqual(contentOffences(own), []);
    assert.deepEqual(contentOffences('// SPDX-License-Identifier: LGPL-2.1-only\nexport const bios = 1;'), []);
    for (const ok of ['lodash', 'sparse-bitfield', 'mathjax', 'klaw', 'fastq']) assert.ok(!FAMILY_PACKAGE.test(ok), ok);
});

test('no lockfile resolves a package of the family', () => {
    // Every package-lock.json in the checkout, three levels deep, outside
    // node_modules (installed trees carry their own, which are not ours).
    const locks = [];
    const walk = (dir, depth) => {
        for (const e of readdirSync(path.join(REPO, dir), {withFileTypes: true})) {
            const rel = path.join(dir, e.name);
            if (e.isDirectory() && depth < 3 && !['node_modules', '.git'].includes(e.name)) walk(rel, depth + 1);
            else if (e.name === 'package-lock.json') locks.push(rel);
        }
    };
    walk('', 0);
    assert.ok(locks.includes('package-lock.json') && locks.includes('packages/scratch-gui/package-lock.json'),
        `found ${locks.join(', ')}`);
    for (const f of locks) {
        assert.deepEqual(lockfileOffences(readFileSync(path.join(REPO, f), 'utf8')), [], f);
    }
});

test('no shipped JavaScript source carries the family\'s fingerprints', () => {
    const roots = [packageSourceRoot('bw-board'), packageSourceRoot('bw-circuit-ui'),
        path.join(REPO, 'overlay/scratch-gui/src'), path.join(REPO, 'overlay/scratch-vm/src')];
    let files = 0;
    const hits = [];
    const walk = dir => {
        for (const e of readdirSync(dir, {withFileTypes: true})) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { if (e.name !== 'node_modules') walk(full); continue; }
            if (!/\.(m?js|jsx|cjs)$/.test(e.name)) continue;
            files++;
            for (const why of contentOffences(readFileSync(full, 'utf8'))) hits.push(`${path.relative(REPO, full)}: ${why}`);
        }
    };
    for (const r of roots) walk(r);
    assert.ok(files > 600, `scanned only ${files} files (750 on 2026-09-25); a root moved?`);
    assert.deepEqual(hits, []);
});
