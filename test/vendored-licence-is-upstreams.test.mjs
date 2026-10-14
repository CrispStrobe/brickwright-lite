/**
 * THE LICENCE OF EACH UPSTREAM PACKAGE IS UPSTREAM'S, AND IT SHIPS.
 *
 * History: two vendored LICENSE files drifted from upstream for weeks because
 * a comparison could not reach them and a ledger excused them as "attribution,
 * not code — permanent". Now that bw-board and bw-circuit-ui are npm packages
 * pinned by sha, installed bytes are checked separately against Git archives;
 * two things can still go wrong and this holds both:
 *
 *   1. the package could stop shipping a LICENSE (a `files` field upstream, or
 *      a rename), and the bundle would carry licensed code with no notice;
 *   2. the copy webpack bundles from (packages/scratch-gui/node_modules) could
 *      differ from the copy the tests read (root node_modules) — two installs,
 *      one pin, and only one of them is what ships.
 *
 * Fired at a planted counter-example on the day it was rewritten (2026-09-12):
 * an empty LICENSE reds clause 1; a one-byte edit to the packages copy reds
 * clause 2.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { PACKAGES } from '../scripts/pin-packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootCopy = name => path.join(ROOT, 'node_modules', name, 'LICENSE');
const bundleCopy = name => path.join(ROOT, 'packages', 'scratch-gui', 'node_modules', name, 'LICENSE');

export const licenceLooksReal = text =>
    /MIT License/.test(text) && /Copyright \(c\) (19|20)\d\d/.test(text) && /Permission is hereby granted/.test(text);

for (const name of PACKAGES) {
    test(`${name}: the installed package preserves its actual upstream licence`, () => {
        assert.ok(fs.existsSync(rootCopy(name)), `${name} has no LICENSE in node_modules — the package stopped shipping it`);
        const text = fs.readFileSync(rootCopy(name), 'utf8');
        if (name === 'bw-board') {
            assert.ok(licenceLooksReal(text), `${name}/LICENSE is not a real MIT notice with a year`);
            assert.match(text, /CrispStrobe/, `${name}/LICENSE does not name the upstream holder`);
        } else {
            assert.equal(name, 'bw-circuit-ui', 'classify any newly pinned package explicitly');
            assert.match(text, /^Mozilla Public License Version 2\.0\r?\n/);
            assert.match(text, /Exhibit A/);
            assert.match(text, /Exhibit B/);
        }
        const license = name === 'bw-board' ? 'MIT' : 'MPL-2.0';
        assert.equal(fs.readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/licenses', `${name}.${license}.txt`), 'utf8'), text,
            'the app static notice preserves the complete installed LICENSE bytes');
    });

    test(`${name}: the copy webpack bundles is byte-identical to the copy the tests read`, {
        skip: fs.existsSync(bundleCopy(name)) ? false : `packages/scratch-gui/node_modules/${name} not installed here`
    }, () => {
        assert.equal(fs.readFileSync(bundleCopy(name), 'utf8'), fs.readFileSync(rootCopy(name), 'utf8'),
            `${name}: root and packages/scratch-gui installs carry DIFFERENT licence text — one pin, two trees`);
    });
}

test('the predicate fires at the counter-examples it guards against', () => {
    assert.equal(licenceLooksReal(''), false);
    assert.equal(licenceLooksReal('MIT License\n\nCopyright (c) CrispStrobe\n\nPermission is hereby granted'), false, 'no year');
    assert.equal(licenceLooksReal('See LICENSE in the repository root.'), false, 'a pointer is not a licence');
    assert.equal(licenceLooksReal('MIT License\n\nCopyright (c) 2026 CrispStrobe\n\nPermission is hereby granted, free of charge'), true);
});
