/**
 * An .sb3 asset is named by the md5 of its own bytes. That is not decoration:
 * `md5ext` IS the filename inside the archive, so when the id and the content
 * disagree, every project saved from a fresh start ships an archive whose
 * assets do not verify against their own names.
 *
 * MEASURED 2026-09-04, from a live save/load round trip against a production
 * build rather than by reading. The saved .sb3 stored costume2 as
 * `0fb9be3e8397c983338cb71dc84d0b25.svg` while those bytes hash to
 * `404462a29fe1d73ede8ea6b9ded5fabc`. Loading it back recomputed the hash, so
 * the costume's id CHANGED across a round trip that altered nothing — which is
 * how the mismatch first became visible at all.
 *
 * CAUSE, and it is not a load bug: `0d58e52be` ("Use the Brickwright robot
 * everywhere: favicon, menu-bar logo, default sprite") replaced the default
 * sprite's artwork by overwriting both costume files in place, keeping the
 * original upstream cat filenames and the ids in project-data.js. Both files
 * now hold the SAME robot SVG, so the default sprite's two costumes are also
 * byte-identical to each other.
 *
 * NOTHING CRASHES because of this — the archive is self-consistent (project.json
 * names the entries it contains) and scratch-vm loads by md5ext, then recomputes.
 * It is an integrity and determinism defect, not a stability one: save, load and
 * save again and the asset ids differ.
 *
 * This is a RATCHET, not a red test. The two known-bad files are listed so a
 * NEW mismatch fails immediately, and so fixing either one fails here too and
 * forces the list to shrink. A proper repair renames the file to its true hash
 * and updates BOTH `project-data.js` and the vendored `default-project/index.js`
 * that imports it by literal filename — the second is why this is recorded
 * rather than fixed in passing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'overlay/scratch-gui/src/lib/default-project');

/** name -> why it does not hash to itself. Entries may only be REMOVED. */
const KNOWN_MISMATCHED = {
    'bcf454acf82e4504149f7ffe07081dbc.svg':
        'costume1 of the default sprite. Holds the Brickwright robot from 0d58e52be, ' +
        'which hashes to 404462a29fe1d73ede8ea6b9ded5fabc.',
    '0fb9be3e8397c983338cb71dc84d0b25.svg':
        'costume2 of the default sprite. Byte-identical to costume1 above, so the ' +
        'sprite ships two costumes that render the same image.'
};

const assets = readdirSync(DIR).filter(f => /\.(svg|wav|png)$/i.test(f));
const md5 = file => createHash('md5').update(readFileSync(path.join(DIR, file))).digest('hex');
const mismatched = assets.filter(f => md5(f) !== f.replace(/\.[^.]+$/, ''));

test('the default project ships assets that are shipped at all', () => {
    assert.ok(assets.length > 0, `no assets found in ${DIR}`);
});

test('no NEW default-project asset disagrees with its own content hash', () => {
    const unexpected = mismatched.filter(f => !(f in KNOWN_MISMATCHED));
    assert.deepEqual(unexpected, [],
        `these assets are named by an id that is not the md5 of their bytes: ${unexpected.join(', ')}. ` +
        'Every project saved from a fresh start would carry them, and their ids would change on ' +
        'the next load. Name the file after `md5sum` of its content and update project-data.js ' +
        'and default-project/index.js together.');
});

test('the known-mismatched list only shrinks', () => {
    const fixed = Object.keys(KNOWN_MISMATCHED).filter(f => !mismatched.includes(f));
    assert.deepEqual(fixed, [],
        `these are listed as mismatched but now hash correctly — delete them from ` +
        `KNOWN_MISMATCHED: ${fixed.join(', ')}`);
});

test('the recorded cause still holds: both default costumes are the same image', () => {
    // If someone gives costume2 its own artwork, this fails and the comment above
    // stops being true — which is the point. The claim is dated, not eternal.
    const names = Object.keys(KNOWN_MISMATCHED);
    if (names.length !== 2) return;   // already partly repaired; nothing to assert
    assert.equal(md5(names[0]), md5(names[1]),
        'the two default costumes now differ — update this file\'s header, which ' +
        'records them as byte-identical since 0d58e52be');
});
