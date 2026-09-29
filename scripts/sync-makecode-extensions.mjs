#!/usr/bin/env node
/**
 * sync:makecode-extensions — vendor the third-party MakeCode extensions (packages)
 * that MakeCode's own micro:bit documentation depends on, so a project that uses
 * one compiles and simulates with no network.
 *
 * WHY. A MakeCode project names its extensions in pxt.json
 * (`"microturtle": "github:Microsoft/pxt-microturtle#v0.0.9"`); MakeCode's editor
 * downloads them from GitHub. lite's pxt runs offline (lib/bw-makecode/pxt-runtime.js
 * refuses every network hook), so without a local copy such a project cannot
 * even compile. The makecode census found 7 of pxt-microbit's 215 doc programs in
 * that state (docs/generated/MAKECODE-CENSUS.md, `needs-extension`).
 *
 * WHAT IS VENDORED, AND HOW IT IS PINNED. Each extension in EXTENSIONS below is
 * fetched from GitHub at an exact 40-hex COMMIT (the tag it was published under is
 * recorded, and resolved to that commit when the pin was taken, but never
 * fetched by name). Only what pxt compiles is taken: pxt.json, the files its
 * `files` list names, and the LICENSE. Each file's bytes are checked against the
 * git blob sha GitHub's tree for that commit records BEFORE anything is written,
 * so a CDN serving other bytes fails closed. The result is written, with the
 * blob shas, to lib/bw-makecode/extensions-vendored.js — plain source text, a few
 * kilobytes, compiled into the bundle; the pxt glue serves it to pxt when a
 * project names that extension (pxt-runtime.js, pkgOverrideAsync).
 *
 * LICENCES. An extension is vendored only when its LICENSE is one that allows
 * redistribution (REDISTRIBUTABLE below) AND says the licence the pin declares;
 * anything else is REFUSED by name and nothing is written. The holders are
 * carried into THIRD-PARTY-NOTICES.md and the About dialog's licence texts.
 *
 * Usage:
 *   node scripts/sync-makecode-extensions.mjs            # fetch at the pins, verify, write
 *   node scripts/sync-makecode-extensions.mjs --check    # fetch and compare; never write
 * Offline, test/makecode-extensions.test.mjs re-derives every blob sha from the
 * committed text, so a hand edit to the vendored source reds without a network.
 */
// WHAT THIS SHIPS, for THIRD-PARTY-NOTICES.md (test/notices-drift.test.mjs reads it).
export const NOTICE = {"name":"MakeCode extensions","licence":"MIT","holder":"Microsoft Corporation"};
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/extensions-vendored.js');
const FULL_SHA = /^[0-9a-f]{40}$/;

/** Licences whose terms allow us to redistribute the source in the app. */
export const REDISTRIBUTABLE = ['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'ISC', '0BSD'];

/**
 * The pins. `spec` is how MakeCode's documentation names the extension (the
 * `package` block of the page that uses it) — the key a project's pxt.json
 * carries. `commit` is what `tag` resolved to on 2026-09-29 (git/ref/tags, a
 * lightweight tag in all three repos); it, not the tag, is what is fetched.
 * `usedBy` is the census rows that need it.
 */
export const EXTENSIONS = [
    {
        id: 'microturtle',
        spec: 'github:Microsoft/pxt-microturtle#v0.0.9',
        repo: 'microsoft/pxt-microturtle',
        tag: 'v0.0.9',
        commit: 'b8a0289980fcaff3b5e7ea6560b85b24f2b1492e',
        licence: 'MIT',
        holder: 'Microsoft Corporation',
        usedBy: ['projects/turtle-scanner', 'projects/turtle-spiral', 'projects/turtle-square']
    },
    {
        id: 'radio-blockchain',
        spec: 'github:Microsoft/pxt-radio-blockchain#v0.1.4',
        repo: 'microsoft/pxt-radio-blockchain',
        tag: 'v0.1.4',
        commit: 'fec2d45d8b514aff2c9c398a3e41711ecdca4e21',
        licence: 'MIT',
        holder: 'Microsoft Corporation',
        usedBy: ['projects/micro-coin']
    },
    {
        id: 'pxt-kitronik-motor-driver',
        spec: 'github:kitronikltd/pxt-kitronik-motor-driver#v0.0.3',
        repo: 'KitronikLtd/pxt-kitronik-motor-driver',
        tag: 'v0.0.3',
        commit: 'be38482e6a7a97dae80ef51b8b7e98767900dc00',
        licence: 'MIT',
        holder: 'Kitronik Ltd',
        usedBy: ['projects/rc-car/connect']
    }
];

/** git's object id for a blob: sha1("blob <len>\0" + bytes). What GitHub's tree lists. */
export const gitBlobSha = bytes => crypto.createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), Buffer.from(bytes)])).digest('hex');

/**
 * The licence a LICENSE text states, by its own wording, or null. Deliberately
 * narrow: a text this does not recognise is refused, not guessed at.
 */
export function licenceOf (text) {
    const t = String(text).replace(/\s+/g, ' ');
    if (/^\s*MIT License\b/.test(t) && /Permission is hereby granted, free of charge/.test(t)) return 'MIT';
    if (/Apache License,? Version 2\.0/.test(t)) return 'Apache-2.0';
    if (/Redistribution and use in source and binary forms/.test(t)) return /Neither the name/.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause';
    if (/Permission to use, copy, modify, and\/or distribute this software for any purpose/.test(t)) return 'ISC';
    return null;
}

/** The vendoring verdict for one pin and its fetched LICENSE text: {ok} or {ok: false, reason}. */
export function licenceVerdict (pin, licenseText) {
    const found = licenceOf(licenseText);
    if (!found) return {ok: false, reason: `${pin.repo}@${pin.commit}: its LICENSE is not a licence this sync recognises — refused, not vendored`};
    if (!REDISTRIBUTABLE.includes(found)) return {ok: false, reason: `${pin.repo}: ${found} does not allow us to redistribute it — refused`};
    if (found !== pin.licence) return {ok: false, reason: `${pin.repo}: LICENSE says ${found}, the pin declares ${pin.licence}`};
    if (!licenseText.includes(pin.holder)) return {ok: false, reason: `${pin.repo}: LICENSE does not name ${pin.holder}, the holder the notices carry`};
    return {ok: true};
}

async function get (url, as = 'buffer') {
    const res = await fetch(url, {headers: {'user-agent': 'brickwright-lite sync-makecode-extensions'}});
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return as === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
}

/** Fetch one pin at its commit and verify every byte against the commit's tree. */
export async function fetchExtension (pin) {
    if (!FULL_SHA.test(pin.commit)) throw new Error(`${pin.repo}: commit ${pin.commit} is not a full 40-hex sha`);
    const {commit, repo} = pin;
    const tree = await get(`https://api.github.com/repos/${repo}/git/trees/${commit}`, 'json');
    const blobs = new Map(tree.tree.filter(e => e.type === 'blob').map(e => [e.path, e.sha]));
    const raw = async file => {
        const bytes = await get(`https://raw.githubusercontent.com/${repo}/${commit}/${file}`);
        const sha = gitBlobSha(bytes);
        if (blobs.get(file) !== sha) throw new Error(`${repo}@${commit}: ${file} arrived as blob ${sha}, the commit's tree says ${blobs.get(file)}`);
        return {text: bytes.toString('utf8'), blob: sha};
    };
    const licenceFile = ['LICENSE', 'LICENSE.txt', 'LICENSE.md'].find(f => blobs.has(f));
    if (!licenceFile) throw new Error(`${repo}@${commit}: no LICENSE file — refused, not vendored`);
    const licence = await raw(licenceFile);
    const verdict = licenceVerdict(pin, licence.text);
    if (!verdict.ok) throw new Error(verdict.reason);
    const pxtJson = await raw('pxt.json');
    const cfg = JSON.parse(pxtJson.text);
    const files = {'pxt.json': pxtJson};
    for (const f of cfg.files || []) files[f] = await raw(f);
    return {id: pin.id, spec: pin.spec, repo, tag: pin.tag, commit, licence: pin.licence, holder: pin.holder,
        licenceFile, licenceText: licence, usedBy: pin.usedBy, files};
}

/** The generated module's text. */
export function render (entries) {
    return `/**
 * GENERATED by scripts/sync-makecode-extensions.mjs — do not edit by hand.
 *
 * Third-party MakeCode extensions, vendored as source at exact commits, so a
 * project that names one compiles offline (lib/bw-makecode/pxt-runtime.js serves
 * them to pxt). Every file carries the git blob sha of the upstream file at that
 * commit; test/makecode-extensions.test.mjs re-derives them from the text below.
 * Licences and holders: THIRD-PARTY-NOTICES.md, static/licenses/makecode-extensions.MIT.txt.
 */
export const VENDORED_EXTENSIONS = ${JSON.stringify(entries, null, 1)};
`;
}

async function main () {
    const check = process.argv.includes('--check');
    const entries = [];
    for (const pin of EXTENSIONS) entries.push(await fetchExtension(pin));
    const text = render(entries);
    if (check) {
        const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
        if (now !== text) { console.error(`[sync:makecode-extensions] ${path.relative(ROOT, OUT)} is not what the pins produce — run without --check`); process.exit(1); }
        console.log(`[sync:makecode-extensions] ${entries.length} extensions match their pinned commits`);
        return;
    }
    fs.writeFileSync(OUT, text);
    for (const e of entries) console.log(`[sync:makecode-extensions] ${e.repo}@${e.commit} (${e.tag}, ${e.licence}): ${Object.keys(e.files).join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(e => { console.error(`[sync:makecode-extensions] ${e.message}`); process.exit(1); });
}
