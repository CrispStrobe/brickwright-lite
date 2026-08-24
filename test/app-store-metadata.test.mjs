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
    assert.ok(lock.includes(`version = "${config.version}"`),
        `Cargo.lock does not carry ${config.version} — bump it with the other two`);

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
});
