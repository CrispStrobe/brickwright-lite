import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const metadataPath = new URL('../docs/app-store-metadata.md', import.meta.url);

const section = (source, title) => {
    const marker = `## ${title}\n\n`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `metadata contains ${title}`);
    const bodyStart = start + marker.length;
    const next = source.indexOf('\n## ', bodyStart);
    return source.slice(bodyStart, next === -1 ? undefined : next).trim();
};

test('canonical store descriptions are bilingual, accurate, and within Apple limits', async () => {
    const source = await readFile(metadataPath, 'utf8');
    const names = [
        'TestFlight app description — en-US',
        'TestFlight app description — de-DE',
        'App Store description — en-US',
        'App Store description — de-DE',
        'What to Test — 0.1.6 en-US',
        'What to Test — 0.1.6 de-DE'
    ];

    for (const name of names) {
        const copy = section(source, name);
        assert.ok(copy.length > 500, `${name} has useful detail`);
        assert.ok(copy.length <= 4000, `${name} fits the App Store Connect limit`);
    }

    assert.doesNotMatch(source, /TurboWarp\/Scratch fork/i);
    assert.doesNotMatch(source, /fork of TurboWarp/i);
    assert.match(source, /not a TurboWarp fork/);
    assert.match(source, /kein TurboWarp-Fork/);
    assert.match(source, /generated views/);
    assert.match(source, /erzeugten\s+Ansichten/);
});

test('native package versions stay aligned for the TestFlight train', async () => {
    const cargo = await readFile(new URL('../apps/tauri/src-tauri/Cargo.toml', import.meta.url), 'utf8');
    const lock = await readFile(new URL('../apps/tauri/src-tauri/Cargo.lock', import.meta.url), 'utf8');
    const config = JSON.parse(await readFile(
        new URL('../apps/tauri/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
    const notes = await readFile(new URL('../docs/app-store-metadata.md', import.meta.url), 'utf8');
    const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];

    assert.equal(cargoVersion, config.version,
        'Cargo.toml and tauri.conf.json disagree about the version');

    // The Cargo.lock entry too: the 0.1.5 -> 0.1.6 release touched all three, and
    // a lock left behind is the kind of thing nobody notices until a build differs
    // from the tag that produced it.
    //
    // Anchored on OUR PACKAGE BLOCK, not on the version string appearing anywhere.
    // At 0.1.7 the lock held five `version = "0.1.7"` lines — ours plus
    // crypto-common, num_threads, windows-version and zerofrom-derive, which sit
    // at that version by coincidence. A substring check passes on any of them, so
    // it would have gone green with our own entry left behind: the exact failure
    // it exists to catch.
    assert.match(lock, new RegExp(
        `name = "brickwright-tauri"\\nversion = "${config.version.replace(/\./g, '\\.')}"`),
    `Cargo.lock's brickwright-tauri entry is not at ${config.version} — bump it with the other two`);

    // NO HARDCODED VERSION HERE ANY MORE. This assertion used to read
    // `assert.equal(config.version, '0.1.6')`, which meant every release had to
    // hand-edit a literal in a test, and forgetting turned the release commit
    // red — which is exactly what happened preparing 0.1.7. The property that
    // actually matters is not "the version is 0.1.6", it is "whatever version we
    // are shipping, the testers have notes telling them what to test". That is
    // checked instead, and it needs no maintenance at the next bump.
    assert.match(notes, new RegExp(`## What to Test — ${config.version.replace(/\./g, '\\.')} en-US`),
        `docs/app-store-metadata.md has no English tester notes for ${config.version}`);
    assert.match(notes, new RegExp(`## What to Test — ${config.version.replace(/\./g, '\\.')} de-DE`),
        `docs/app-store-metadata.md has no German tester notes for ${config.version}`);

    // ...and that someone SENDS them, and that what gets sent is the WHOLE
    // section. The two assertions above prove the notes were WRITTEN, which is
    // not the property anyone cares about: 0.1.7 and 0.1.8 both reached App
    // Store Connect with `whatsNew` EMPTY in both locales while this file
    // stayed green, because nothing in the repo transmitted them. A gate that
    // can only see a value's source, never its destination, is green for the
    // wrong reason.
    const mobile = await readFile(new URL('../.github/workflows/mobile.yml', import.meta.url), 'utf8');
    assert.match(mobile, /run: node scripts\/push-tester-notes\.mjs/,
        'mobile.yml no longer runs scripts/push-tester-notes.mjs — the tester notes ' +
        'would be written and never sent, which is how 0.1.7 shipped with none');

    // The same property one step further out. Notes on a build nobody can
    // install are worth as little as notes never sent: until 0.1.10 the group
    // assignment and Beta App Review submission were manual, and the INTERNAL
    // group sat on 0.1.0 through nine releases because one release forgot and
    // nothing ever noticed.
    assert.match(mobile, /run: node scripts\/testflight-submit\.mjs/,
        'mobile.yml no longer runs scripts/testflight-submit.mjs — builds would upload ' +
        'and reach no tester group');

    // Behavioural, not textual: the first version of this check banned the
    // regex that truncated the notes and matched the COMMENT explaining it.
    // So exercise the real slicer against the real file instead.
    const {testerNotes} = await import('../scripts/push-tester-notes.mjs');
    for (const locale of ['en-US', 'de-DE']) {
        const body = testerNotes(notes, config.version, locale);
        assert.ok(body, `the sender finds no ${locale} section for ${config.version}`);
        // The truncation bug returned a single line of an otherwise fine file.
        assert.ok(body.split('\n').length > 3,
            `the sender returns ${body.split('\n').length} line(s) of ${locale} notes — ` +
            'it is truncating the section again');
        assert.ok(body.length <= 4000,
            `${locale} notes are ${body.length} chars; App Store Connect caps whatsNew at 4000`);
        assert.ok(!body.startsWith('## '),
            'the slice starts at a heading — it is capturing the following section');
    }
});
