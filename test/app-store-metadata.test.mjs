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
    const config = JSON.parse(await readFile(
        new URL('../apps/tauri/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
    const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];

    assert.equal(cargoVersion, config.version);
    assert.equal(config.version, '0.1.6');
});
