/**
 * The font table is ours, and the KEYS are the contract.
 *
 * A saved project stores the font-family NAME its text costume uses, not the
 * file behind it. So a key that disappears strips the style from work a user
 * already saved, and that — not the swap itself — is the risk in replacing a
 * face. This holds the fork to: every key upstream publishes still exists, the
 * replaced face is ours and is OFL-licensed, and a project SAVED BEFORE the
 * swap still names families the table can resolve.
 *
 * Measured 2026-09-07, from each face's own `name` table rather than from the
 * package's notice: five of the seven are SIL OFL 1.1; `Grand9K-Pixel.ttf`
 * (key "Pixel") is CC BY-SA 3.0 by URL only; `Scratch.ttf` (key "Scratch")
 * carries no licence identifier at all; and the package itself has no `license`
 * field. The fork replaces the first and keeps every key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FORK = path.join(ROOT, 'overlay/scratch-gui/src/lib/render-fonts/index.js');
const UPSTREAM = path.join(ROOT, 'packages/scratch-gui/node_modules/scratch-render-fonts/src/index.js');
const FIXTURE = path.join(ROOT, 'test/fixtures/saved-before-font-swap.sb3');

/** The font-family keys a table module declares, read from its source. */
const keysOf = source => [...source.matchAll(/^\s*'([^']+)':\s*require\(/gm)].map(m => m[1]);

test('every key upstream publishes survives the fork — a saved project names keys, not files', {
    skip: existsSync(UPSTREAM) ? false : 'scratch-render-fonts not installed — run npm install first'
}, () => {
    const upstream = keysOf(readFileSync(UPSTREAM, 'utf8'));
    const fork = keysOf(readFileSync(FORK, 'utf8'));
    assert.ok(upstream.length >= 7, `upstream declares ${upstream.length} keys; expected the seven menu entries`);
    const lost = upstream.filter(k => !fork.includes(k));
    assert.deepEqual(lost, [], `key(s) dropped by the fork — every project using them loses its text style:\n  ${lost.join('\n  ')}`);
    // and no key invented either: the menu is upstream's.
    const added = fork.filter(k => !upstream.includes(k));
    assert.deepEqual(added, [], `key(s) the menu has no entry for: ${added.join(', ')}`);
});

test('the replaced face is ours, is the file the fork names, and carries its licence', () => {
    const fork = readFileSync(FORK, 'utf8');
    assert.match(fork, /'Pixel':\s*require\('base64-loader!\.\/PixelifySans-Regular\.ttf'\)/,
        'the Pixel key must load the vendored replacement, not the package copy');
    const dir = path.dirname(FORK);
    assert.ok(existsSync(path.join(dir, 'PixelifySans-Regular.ttf')), 'the vendored face is missing');
    const licence = readFileSync(path.join(dir, 'OFL-PixelifySans.txt'), 'utf8');
    assert.match(licence, /SIL Open Font License, Version 1\.1/, 'the vendored face ships without its licence');
    assert.match(licence, /Copyright 2021 The Pixelify Sans Project Authors/,
        'OFL clause 2 requires the copyright notice to travel with the font');
    // The five kept faces still come from the package, not from copies of ours.
    for (const kept of ['NotoSans-Medium.ttf', 'SourceSerifPro-Regular.otf', 'handlee-regular.ttf',
        'Knewave.ttf', 'Griffy-Regular.ttf']) {
        assert.ok(fork.includes(`scratch-render-fonts/src/${kept}`),
            `${kept} should stay upstream's copy — replacing an OFL face re-renders saved work for no gain`);
    }
});

/**
 * The `name` table of a TrueType/OpenType file, parsed here rather than shelled
 * out to a font tool: a gate that resolves a binary from PATH is exercising
 * whatever that machine happens to have (gate-shapes AMBIENT-BINDING), and the
 * point of this check is to read the face's OWN declaration.
 * @param {Buffer} buffer the font file
 * @returns {Map<number, string>} name ID -> string (0 copyright, 13 licence, 14 licence URL)
 */
const nameTable = buffer => {
    const tables = buffer.readUInt16BE(4);
    let offset = null;
    for (let i = 0; i < tables; i++) {
        const record = 12 + (i * 16);
        if (buffer.toString('ascii', record, record + 4) === 'name') {
            offset = buffer.readUInt32BE(record + 8);
            break;
        }
    }
    if (offset === null) return new Map();
    const count = buffer.readUInt16BE(offset + 2);
    const strings = offset + buffer.readUInt16BE(offset + 4);
    const out = new Map();
    for (let i = 0; i < count; i++) {
        const record = offset + 6 + (i * 12);
        const platform = buffer.readUInt16BE(record);
        const nameId = buffer.readUInt16BE(record + 6);
        const length = buffer.readUInt16BE(record + 8);
        const at = strings + buffer.readUInt16BE(record + 10);
        // Platform 3 (Windows) stores UTF-16BE; platform 1 (Macintosh) Latin-1.
        // swap16 mutates, so the subarray is copied before it is byte-swapped.
        const text = platform === 3
            ? Buffer.from(buffer.subarray(at, at + length)).swap16().toString('utf16le')
            : buffer.toString('latin1', at, at + length);
        if (!out.has(nameId) && text.trim()) out.set(nameId, text.replace(/\s+/g, ' ').trim());
    }
    return out;
};

test('the vendored face declares SIL OFL 1.1 in its OWN name table, not on a website', () => {
    const names = nameTable(readFileSync(path.join(path.dirname(FORK), 'PixelifySans-Regular.ttf')));
    assert.match(names.get(13) || '', /SIL Open Font License/,
        `the face does not declare OFL in its own name table (licence record: ${names.get(13) || 'absent'})`);
    assert.match(names.get(0) || '', /Pixelify Sans Project Authors/,
        `the face does not carry its copyright (record: ${names.get(0) || 'absent'})`);
    // The parser is the evidence, so prove it reads a face we already know:
    // the replaced Grand9K Pixel declares CC BY-SA by URL and NO licence text,
    // which is the whole reason it is being replaced.
    const replaced = path.join(ROOT, 'packages/scratch-gui/node_modules/scratch-render-fonts/src/Grand9K-Pixel.ttf');
    if (existsSync(replaced)) {
        const old = nameTable(readFileSync(replaced));
        assert.equal(old.get(13), undefined, 'Grand9K Pixel was expected to carry no licence description');
        assert.match(old.get(14) || '', /creativecommons\.org\/licenses\/by-sa\/3\.0/,
            'Grand9K Pixel was expected to declare CC BY-SA 3.0 by URL alone');
    }
});

test('a project SAVED BEFORE the swap still names families the fork resolves', {
    skip: existsSync(FIXTURE) ? false : `fixture missing: ${path.relative(ROOT, FIXTURE)}`
}, async () => {
    const {default: JSZip} = await import('jszip');
    const zip = await JSZip.loadAsync(readFileSync(FIXTURE));
    const svgs = Object.keys(zip.files).filter(n => n.endsWith('.svg'));
    assert.ok(svgs.length > 0, 'the fixture carries no costume');
    const families = new Set();
    for (const name of svgs) {
        const text = await zip.file(name).async('string');
        for (const m of text.matchAll(/font-family="([^"]+)"/g)) families.add(m[1]);
    }
    assert.ok(families.size > 0, 'the fixture names no font-family — it cannot prove anything about keys');
    const fork = keysOf(readFileSync(FORK, 'utf8'));
    const unresolved = [...families].filter(f => !fork.includes(f));
    assert.deepEqual(unresolved, [],
        `the fixture was saved with font-famil${families.size === 1 ? 'y' : 'ies'} the fork cannot resolve — ` +
        `existing projects would lose their text style:\n  ${unresolved.join('\n  ')}`);
});

// NO MIRROR TEST HERE ON PURPOSE. scripts/integrate.mjs copies overlay/scratch-gui
// wholesale into packages/scratch-gui, and test/no-dead-overlay-modules.test.mjs
// ("the integrated tree is current") already fails when any overlay file differs
// from its packages counterpart. A second assertion about the same fact is one
// more thing to keep in step, with a worse message than the one that exists.
