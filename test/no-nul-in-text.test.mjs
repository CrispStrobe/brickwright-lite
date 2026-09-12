/**
 * NO TRACKED TEXT FILE CONTAINS A NUL BYTE.
 *
 * Found 2026-09-07 by brickwright-lite-ea: test/fetch-pinning.test.mjs held a
 * literal NUL where the two-character escape was meant — the binary-detection
 * check had made its own file binary — which is why grep printed "binary file
 * matches" for lego-be, why git showed UU with no conflict markers, and why a
 * rebase stopped on a file nobody could read. MEASURED, every tracked file:
 * 11,370 files, 1,759 hold a NUL, 1,754 of them binary by format, and FIVE
 * text files — bw-board/board.js (4 NULs) and its packages mirror,
 * bw-circuit-ui importers/easyeda-pro-pcb.js (2) and model/board-lift.js (1),
 * and fetch-pinning (1). ONE SPECIES in all five: a literal NUL typed inside a
 * template literal used as a composite Map key where the escape was meant.
 * JavaScript reads the byte as the same character, so nothing ever
 * misbehaved; the cost is entirely to the tools that read source — grep,
 * diff, merge — which call the file binary. Three of the five are
 * byte-identical to their upstream at the pin (bw-board d5850e6, bw-circuit-ui
 * a879732) and are upstream findings; the fourth is lego-be's one character.
 *
 * Exempt BY ROLE: binary formats by extension — images, audio, firmware and
 * ROM images, WebAssembly, archives, Scratch project/sprite bundles. That is
 * the set of formats the sweep found, stated so a new binary format fails by
 * name once and gets its extension added with its reason.
 *
 * KNOWN carries the four files above with the pin their bytes came from.
 * Every entry EXPIRES: the moment the NUL is gone (upstream fixed and
 * re-vendored, or the test edited), the entry is red as stale and must be
 * removed — a ratchet cannot outlive the defect it names.
 *
 * Two sentences from lego-be, who read the first sweep: git samples roughly
 * the first 8 KB to decide binary, so the same defect was visible to git in
 * one file and invisible in the other — sweep by BYTE, never by symptom. And:
 * a count over the wrong set is a different question, not a smaller answer
 * (the sweep's 1,759 hits are mostly PNGs; the answer is the five). One from
 * the measuring: in zsh, quote every `<ref>:<path>` — `$P:src/board.js`
 * is a history modifier, and git will happily show a different object.
 *
 * Red names the file, the line, the byte offset and the surrounding text.
 * This file itself spells the byte only as an escape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, statSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const NUL = String.fromCharCode(0);

/** Binary formats by role. A NUL is expected in these. */
export const BINARY_BY_ROLE = {
    image: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'icns', 'cur', 'webp'],
    audio: ['wav', 'mp3', 'ogg'],
    firmware: ['bin', 'rom', 'com', 'uf2', 'elf'],
    wasm: ['wasm'],
    archive: ['zip', 'sb3', 'sb2', 'sprite3', 'sprite2', 'gz', 'tgz'],
    object: ['lib', 'o', 'a'],
    // Typefaces. A font is binary by role in the same way a ROM is: the bytes
    // ARE the artefact. Added 2026-09-07 with the vendored replacement for the
    // CC BY-SA pixel face (overlay/scratch-gui/src/lib/render-fonts/), which
    // this gate caught on its first CI run — correctly, since nothing had told
    // it fonts existed here.
    font: ['ttf', 'otf', 'woff', 'woff2', 'eot']
};
const BINARY_EXT = new Set(Object.values(BINARY_BY_ROLE).flat());
export const isBinaryByRole = file => BINARY_EXT.has((file.match(/\.([^./]+)$/) || [, ''])[1].toLowerCase());

/** Files carrying a NUL that upstream must fix (or lego-be's one character); each expires when its NUL is gone. */
export const KNOWN = [
    {file: 'node_modules/bw-circuit-ui/src/importers/easyeda-pro-pcb.js', nuls: 2, pin: 'bw-circuit-ui a8797322', why: 'composite key at line 305; identical to upstream at the pin — fix in bw-circuit-ui, re-vendor'},
    {file: 'node_modules/bw-circuit-ui/src/model/board-lift.js', nuls: 1, pin: 'bw-circuit-ui a8797322', why: 'composite key at line 106; identical to upstream at the pin — fix in bw-circuit-ui, re-vendor'},
];

/** Every NUL in a buffer, as {offset, line, context}. Pure. */
export const nulsIn = buf => {
    const out = [];
    let i = -1;
    while ((i = buf.indexOf(0, i + 1)) >= 0) {
        const line = buf.subarray(0, i).toString('latin1').split('\n').length;
        const context = buf.subarray(Math.max(0, i - 40), i + 20).toString('utf8').split(NUL).join('<NUL>').replace(/\n/g, '⏎');
        out.push({offset: i, line, context});
    }
    return out;
};

/** Judge a list of {file, buf}. Pure; the mutation tests feed it. */
export const judge = (files, known = KNOWN) => {
    const findings = [], stale = [];
    const knownBy = new Map(known.map(k => [k.file, k]));
    let scanned = 0;
    for (const {file, buf} of files) {
        if (isBinaryByRole(file)) continue;
        scanned++;
        const hits = nulsIn(buf);
        const k = knownBy.get(file);
        if (k) {
            if (hits.length === 0) stale.push(`${file}: KNOWN says ${k.nuls} NUL(s) (${k.pin}) and the file has none — the defect is gone; remove the entry`);
            else if (hits.length !== k.nuls) findings.push(`${file}: KNOWN says ${k.nuls} NUL(s), the file has ${hits.length} — the count moved; re-measure and say why`);
            continue;
        }
        for (const h of hits) findings.push(`${file}:${h.line} byte ${h.offset}: literal NUL — …${h.context}… (an escape was probably meant; a NUL makes grep, diff and merge call this file binary)`);
    }
    return {findings, stale, scanned};
};

// `git ls-files` decides what "tracked" means; git from PATH is the AMBIENT-
// BINDING shape, defused: the count floor below fails if it returned nothing.
// gate-shapes-allow
const tracked = () => execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], {encoding: 'utf8', maxBuffer: 64 << 20}).split(NUL).filter(Boolean);

// The count comes from the list, not from a number typed in the name. It read
// "the KNOWN four" while KNOWN held two: the entries expire as their NULs are
// fixed upstream, and a name that restates a count goes stale the first time
// one does.
test(`every tracked file outside a binary role is free of NUL bytes, except the ${KNOWN.length} KNOWN with their pins`, t => {
    const files = [];
    const unreadable = [];
    for (const f of tracked()) { const p = path.join(ROOT, f); let st; try { st = statSync(p); } catch (e) { unreadable.push(`${f} (${e.code})`); continue; } if (st.isFile() && st.size > 0) files.push({file: f, buf: readFileSync(p)}); }
    const {findings, stale, scanned} = judge(files);
    // the skipped set, reported: binaries by role, and anything the walk could not stat
    t.diagnostic(`scanned ${scanned} text files; skipped ${files.length - scanned} binary by role; ${unreadable.length} unreadable${unreadable.length ? ': ' + unreadable.join(', ') : ''}`);
    assert.deepEqual(unreadable, [], 'tracked files this gate could not read');
    // 9,519 on the parent commit. This lane deliberately untracked 1,529
    // generated gallery copies; 1,528 were non-empty text and the remaining
    // file was empty, so the same complete walk now measures 7,991. Keep a
    // floor close to that measured population: intentional deletion changes
    // the number, but a collapsed git walk must still fail closed.
    assert.ok(scanned > 7900, `only ${scanned} text files scanned — 7,991 after removing 1,528 non-empty generated gallery copies; the walk collapsed`);
    assert.deepEqual(stale, [], 'KNOWN entries whose NUL is gone — remove them:\n  ' + stale.join('\n  '));
    assert.deepEqual(findings, [], 'literal NUL byte(s) in tracked text:\n  ' + findings.join('\n  '));
});

test('the binary roles name real formats, and no text format is among them', () => {
    for (const [role, exts] of Object.entries(BINARY_BY_ROLE)) assert.ok(exts.length > 0, role);
    for (const ext of ['js', 'mjs', 'jsx', 'json', 'md', 'yml', 'txt', 'html', 'css', 'svg', 'asm', 'sh']) assert.equal(isBinaryByRole(`x.${ext}`), false, `${ext} is text`);
});

test('mutation: a NUL in a .js file is red naming file, line, offset and context; the same bytes in a .png are not', () => {
    const buf = Buffer.from(`const k = \`\${a}${NUL}\${b}\`;\nnext line\n`, 'utf8');
    const r = judge([{file: 'src/x.js', buf}, {file: 'img/x.png', buf}], []);
    assert.equal(r.findings.length, 1, r.findings.join('\n'));
    assert.match(r.findings[0], /^src\/x\.js:1 byte 15: literal NUL — …const k = `\$\{a\}<NUL>\$\{b\}`;⏎next line⏎…/);
});

test('mutation: a KNOWN entry whose NUL is gone is stale, and one whose count moved is a finding', () => {
    const known = [{file: 'a.js', nuls: 1, pin: 'x', why: 'w'}, {file: 'b.js', nuls: 1, pin: 'x', why: 'w'}];
    const r = judge([{file: 'a.js', buf: Buffer.from('clean\n')}, {file: 'b.js', buf: Buffer.from(NUL + NUL)}], known);
    assert.equal(r.stale.length, 1); assert.match(r.stale[0], /^a\.js: KNOWN says 1 NUL/);
    assert.equal(r.findings.length, 1); assert.match(r.findings[0], /^b\.js: KNOWN says 1 NUL\(s\), the file has 2/);
});

test('the live tree: KNOWN today is exactly the files that still carry a NUL, and this file carries none', () => {
    for (const k of KNOWN) {
        const hits = nulsIn(readFileSync(path.join(ROOT, k.file)));
        assert.equal(hits.length, k.nuls, `${k.file}: ${hits.length} NUL(s) today, KNOWN says ${k.nuls}`);
    }
    assert.equal(nulsIn(readFileSync(new URL(import.meta.url))).length, 0, 'this test spells the byte only as an escape');
});
