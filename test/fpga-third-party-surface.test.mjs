/**
 * The two third-party packages behind the FPGA tier reach us through ONE
 * subpath each, and both choices are licence boundaries rather than taste.
 *
 *   digitaljs        its `browser` entry is the full visual editor, pulling
 *                    jquery-ui and elkjs. elkjs is EPL-2.0, which is not in the
 *                    allowed set. The headless core reaches neither.
 *   yosys2digitaljs  its `node` entry shells out to Yosys and pulls temp-file
 *                    dependencies, one WTFPL-only. `core` requires exactly 3vl,
 *                    big-integer and hashmap.
 *
 * Nothing in the build enforces either. A one-line edit to an import, or
 * deleting the webpack alias, would ship EPL-2.0 in a product whose licence
 * table says it ships BSD-3, Apache-2.0, MIT and MPL-2.0 — and no gate would
 * notice, because the flag-off build drops all of it and the flag-on build is
 * never made here. So this is the gate.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = p => readFileSync(resolve(root, p), 'utf8');
const require = createRequire(import.meta.url);

test('webpack aliases digitaljs to the headless core', () => {
    for (const config of ['overlay/scratch-gui/webpack.config.js',
        'packages/scratch-gui/webpack.config.js']) {
        const src = read(config);
        assert.match(src, /alias\['digitaljs\$'\][^\n]*digitaljs\/lib\/circuit\.js/,
            `${config} must alias digitaljs to its headless core; without it webpack takes `
            + 'the `browser` entry, which pulls elkjs (EPL-2.0)');
    }
});

test('no source imports the full digitaljs entry or the node converter', () => {
    const offenders = [];
    const walk = dir => {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) {
                if (name === 'node_modules') continue;
                walk(p);
                continue;
            }
            if (!/\.(js|jsx|mjs)$/.test(name)) continue;
            const src = readFileSync(p, 'utf8');
            // The alias makes a bare `digitaljs` import safe in the bundle, but
            // an explicit deep import of the UI entry would defeat it.
            for (const bad of [/from\s+'digitaljs\/src\/index/, /from\s+'digitaljs\/lib\/index/,
                /require\('digitaljs\/src\/index/, /from\s+'yosys2digitaljs'/,
                /from\s+'yosys2digitaljs\/node'/]) {
                if (bad.test(src)) offenders.push(`${p.replace(root + '/', '')} — ${bad}`);
            }
        }
    };
    walk(resolve(root, 'overlay/scratch-gui/src'));
    assert.deepEqual(offenders, [],
        'these import the entry that pulls EPL-2.0 or WTFPL code');
});

test('the converter core requires only the three audited packages', () => {
    // If a future version of yosys2digitaljs adds a dependency to its core path,
    // this goes red before the notices go stale.
    const corePath = require.resolve('yosys2digitaljs/core');
    const src = readFileSync(corePath, 'utf8');
    const required = [...src.matchAll(/require\("([^"]+)"\)/g)]
        .map(m => m[1])
        .filter(x => !x.startsWith('.') && !x.startsWith('node:'))
        .sort();
    assert.deepEqual([...new Set(required)], ['3vl', 'big-integer', 'hashmap'],
        'the audited set is 3vl (BSD-2), big-integer (Unlicense), hashmap (MIT)');
});

test('elkjs is not reachable from what we actually import', () => {
    // The whole point. If this ever resolves through our dependency path, the
    // licence table is wrong.
    const headless = require.resolve('digitaljs');
    const src = readFileSync(headless, 'utf8');
    assert.ok(!/elkjs/.test(src),
        `the entry we import (${headless}) references elkjs`);
});

test('both packages are pinned exactly, not by range', () => {
    // A range could move onto a version whose subpaths or trees differ, and the
    // audit would be silently stale.
    const gui = JSON.parse(read('packages/scratch-gui/package.json'));
    for (const name of ['digitaljs', 'yosys2digitaljs']) {
        const spec = gui.dependencies[name];
        assert.match(spec, /^\d+\.\d+\.\d+$/,
            `${name} must be pinned exactly, got ${spec}`);
    }
});
