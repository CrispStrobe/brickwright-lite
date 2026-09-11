/**
 * THIRD-PARTY-NOTICES.md names everything that ships and carries a licence —
 * and "everything that ships" is DERIVED, never typed (plan T10).
 *
 * Measured 2026-09-07 on main 45fe94bb7 before this gate existed: five shipped
 * third-party things had no notice — jszip (MIT/GPL dual), skulpt (MIT), lit and
 * @lit/react (BSD-3-Clause), emu8051 (MIT, Jari Komppa) and the MicroPython
 * RP2040 firmware the build fetches into static/ (MIT) — 0 wrong licence
 * strings, 0 stale "What ships" paths, and two questions left with the owner
 * (the Apache-2.0 SPDX tags on the owner's own virtual-hub files; the SIL-OFL
 * faces that arrive through upstream's scratch-render-fonts). The existing
 * test/notices-coverage.test.mjs keeps a hand list of vendored things and
 * checks the About dialog; it could not see any of the five, which is the
 * point of deriving.
 *
 * What is derived, and from what — scripts/lib/notices-census.mjs:
 *   npm deps lite adds       from scripts/integrate.mjs, the code that adds them
 *   vendored trees           from vendor-pins.json, LICENSE files, VENDORED headers
 *   ROMs                     from static/roms and the provenance manifests beside them
 *   toolchains, artifacts    from every lib/ dir holding a .wasm, and every
 *                            scripts/sync-*.mjs naming a static/ destination,
 *                            which must `export const NOTICE = {...}`
 *
 * Exempt BY ROLE (see the library header): the owner's own code, upstream
 * scratch-gui's own dependency graph (the notices' stated rule), test fixtures,
 * dev-only packages. The owner's name is read from the git remote, and when it
 * cannot be, the own-code exemption is OFF rather than guessed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import * as censusModule from '../scripts/lib/notices-census.mjs';
const {censusAll, judge, liteAddedDeps, vendoredTrees, roms, wasmToolchains, fetchedArtifacts, sectionFor} = censusModule;

const ROOT = path.resolve(import.meta.dirname, '..');
const NOTICES = readFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');

// The repo owner, from the remote: "git@github.com:Owner/repo" or "https://github.com/Owner/repo".
// `git` from PATH is the AMBIENT-BINDING shape; defused: a remote that cannot be read
// turns the own-code exemption OFF (more red, never less). gate-shapes-allow
const owner = (() => { try { return (execFileSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], {encoding: 'utf8'}).match(/[:/]([\w.-]+)\/[\w.-]+?(?:\.git)?\s*$/) || [])[1] || null; } catch { return null; } })();

const items = censusAll(ROOT, owner);

test('the census found the shipping set it is about to judge (floors per source)', () => {
    const by = k => items.filter(i => i.kind === k);
    assert.ok(by('npm').length >= 10, `${by('npm').length} lite-added npm deps — integrate.mjs adds fourteen today`);
    assert.ok(by('vendored-tree').length >= 3, 'three pinned vendored trees');
    assert.ok(by('rom').length >= 10, 'the ROMs under static/roms');
    assert.ok(by('wasm').length >= 3, 'emu8051, SmallerC, SDCC');
    assert.ok(by('fetched').length >= 3, 'the syncs that place artifacts under static/');
    assert.ok(owner, 'the repo owner could not be read from the git remote; the own-code exemption is off and the findings below are the stricter set');
});

test('everything that ships and carries a licence is named in THIRD-PARTY-NOTICES.md with its licence and holder', t => {
    // the skipped half, reported: packages whose licence/holder could not be read (no node_modules
    // here) are judged by name only — a weaker check, and it says so rather than passing quietly
    const unread = items.filter(i => i.kind === 'npm' && !i.licence).map(i => i.name);
    t.diagnostic(unread.length ? `${unread.length} npm package(s) judged by NAME ONLY (package.json not installed here): ${unread.join(', ')}` : 'every lite-added package judged with its installed licence and holder');
    const findings = judge({notices: NOTICES, owner, items});
    assert.deepEqual(findings, [], 'shipped, licence-bearing, and not (correctly) in the notices:\n  ' + findings.join('\n  '));
});

test('every path the notices say ships still exists (a stale notice claims code we do not carry)', () => {
    // tracked trees only: packages/ is generated, and build-time artifacts under it are gitignored on purpose
    const paths = [...NOTICES.matchAll(/`((?:overlay|apps|scripts)\/[^`\s*]+)`/g)].map(m => m[1].replace(/\/$/, ''));
    const missing = [...new Set(paths)].filter(p => !/[*{]/.test(p) && !existsSync(path.join(ROOT, p)));
    assert.deepEqual(missing, [], 'named in the notices, absent from the tree:\n  ' + missing.join('\n  '));
});

// ---- mutations: each source can go red, by name -----------------------------

const synth = (files) => {
    const root = mkdtempSync(path.join(tmpdir(), 'notices-'));
    for (const [rel, text] of Object.entries(files)) { mkdirSync(path.dirname(path.join(root, rel)), {recursive: true}); writeFileSync(path.join(root, rel), text); }
    return root;
};
const N = '## bw-board — MIT\nCopyright (c) Owner\n\n## labwired-core (WebAssembly) -- MIT\nAndrii Shylenko\n';

test('a vendored file with a third-party VENDORED header, and the same header from the owner\'s own repo', () => {
    const root = synth({
        'overlay/scratch-gui/src/lib/fake-lib.js': '// VENDORED from someone/else-lib docs/x.js — do NOT edit here.\nexport const x = 1;\n',
        'overlay/scratch-gui/src/lib/own-lib.js': '// VENDORED from Owner/own-lib docs/y.js\nexport const y = 1;\n',
        'vendor-pins.json': '{}'
    });
    const trees = vendoredTrees(root, 'Owner');
    const f = judge({notices: N, owner: 'Owner', items: trees});
    assert.equal(f.length, 1, f.join('\n'));
    assert.match(f[0], /^else-lib \(vendored-file, overlay\/scratch-gui\/src\/lib\/fake-lib\.js\)/);
});

test('an npm dependency integrate.mjs adds that no heading names; a scoped one matched by scope-name and by family', () => {
    const deps = liteAddedDeps(synth({'scripts/integrate.mjs': "pkg.dependencies['left-pad'] = '1';\npkg.dependencies['@wokwi/elements'] = '1';\npkg.dependencies['@codemirror/lang-cpp'] = '1';\n"}));
    const f = judge({notices: '## wokwi-elements — MIT\nUri Shaked\n\n## CodeMirror 6 — MIT\n', owner: 'Owner', items: deps});
    assert.deepEqual(f, ['left-pad (npm): shipped, licence unread, and no notices heading names it']);
});

test('a .wasm directory no heading names; a ROM with neither manifest nor notice; a manifest naming the owner\'s repo is own code', () => {
    const root = synth({
        'overlay/scratch-gui/src/lib/mystery-wasm/thing.wasm': 'x',
        'overlay/scratch-gui/static/roms/orphan.bin': 'x',
        'overlay/scratch-gui/static/roms/own.bin': 'x',
        'overlay/scratch-gui/static/roms/own.provenance.json': JSON.stringify({rom: 'own.bin', source: {repo: 'bw-board'}})
    });
    const f = judge({notices: N, owner: 'Owner', items: [...wasmToolchains(root), ...roms(root)]});
    assert.deepEqual(f.sort(), [
        'mystery (wasm): shipped, licence unread, and no notices heading names it',
        'overlay/scratch-gui/static/roms/orphan.bin: shipped ROM with no provenance manifest and no notice naming the file'
    ]);
});

test('a sync that writes under static/ without a NOTICE; one whose NOTICE names a licence the section lacks', () => {
    const root = synth({
        'scripts/sync-blob.mjs': "import fs from 'node:fs';\nconst dest = 'packages/scratch-gui/static/blob';\n",
        'scripts/sync-labwired-wasm.mjs': "export const NOTICE = {\"name\": \"labwired\", \"licence\": \"GPL-3.0\", \"holder\": \"Andrii Shylenko\"};\nconst dest = 'static/labwired';\n"
    });
    const f = judge({notices: N, owner: 'Owner', items: fetchedArtifacts(root)});
    assert.deepEqual(f.sort(), [
        'labwired: the notices section does not state GPL-3.0',
        'scripts/sync-blob.mjs: writes a fetched artifact under static/ and declares no `export const NOTICE = {...}` (absent)'
    ]);
});

test('the NOTICE literal is read by brace matching, so a brace inside a string does not truncate it', () => {
    const {noticeLiteral} = censusModule;
    assert.equal(noticeLiteral('x\nexport const NOTICE = {"name": "a{b}", "licence": "MIT", "holder": "H"};\n'), '{"name": "a{b}", "licence": "MIT", "holder": "H"}');
    assert.equal(noticeLiteral('no declaration'), null);
});

test('sectionFor matches a name only as a word: "lit" is not "split", "board" is not "bw-board", a trailing hyphen is allowed', () => {
    const doc = '## split — MIT\n\n## bw-board — MIT\n\n## labwired-core (WebAssembly) -- MIT\nbody\n';
    assert.equal(sectionFor(doc, 'lit'), null);
    assert.equal(sectionFor(doc, 'board'), null);
    assert.match(sectionFor(doc, 'labwired'), /^## labwired-core/);
    assert.match(sectionFor('## wokwi-elements — MIT\n', '@wokwi/elements'), /wokwi/);
});

test('holderOf reads a copyright LINE, and finds none in a licence that has none', () => {
    // THE REGRESSION THIS EXISTS FOR, measured 2026-09-11. `holderOf` matched
    // /Copyright/i anywhere in the text — correct for a short MIT or BSD notice
    // and wrong the first time it was handed a full licence BODY. MPL-2.0 says
    // "copyright doctrines of fair use, fair dealing, or other equivalents" in
    // section 2.6, so the holder came back as
    //
    //     "doctrines of fair use, fair dealing, or other"
    //
    // and the notices gate reported bw-circuit-ui as missing its holder. The bug
    // had always been there; nothing had ever handed this function a real licence
    // until the vendored bw-circuit-ui LICENSE stopped being a five-line pointer.
    //
    // Anchored to the start of a line now, so this asserts BOTH directions: a real
    // notice is still read, and prose that merely mentions copyright is not.
    const {holderOf} = censusModule;
    assert.equal(holderOf('MIT License\n\nCopyright (c) 2026 CrispStrobe\n\nPermission is'),
        'CrispStrobe', 'a plain MIT notice no longer yields its holder');
    assert.equal(holderOf('Copyright 2020-2026 Someone Else'), 'Someone Else',
        'a bare year range in front of the holder is not being stripped');
    assert.equal(holderOf('  Copyright (c) 2026 Indented Holder'), 'Indented Holder',
        'an indented notice — the shape inside MPL Exhibit A — is not read');

    // The MPL prose that produced the defect. No copyright line, so: null.
    const mplProse = [
        '2.6. Fair Use',
        '',
        'This License is not intended to limit any rights You have under',
        'applicable copyright doctrines of fair use, fair dealing, or other',
        'equivalents.',
        '',
        '3.4. Notices',
        '',
        'You may not remove or alter the substance of any license notices',
        '(including copyright notices, patent notices, disclaimers of warranty...'
    ].join('\n');
    assert.equal(holderOf(mplProse), null,
        'holderOf found a "holder" in licence PROSE that contains no copyright notice at '
        + 'all. Unanchored, it returns "doctrines of fair use, fair dealing, or other" — '
        + 'and a gate that compares that against a notices section reports a missing '
        + 'holder for a file whose licence simply does not name one.');
});
