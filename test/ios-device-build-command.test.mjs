import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const packageJsonUrl = new URL('../apps/tauri/package.json', import.meta.url);
const readmeUrl = new URL('../README.md', import.meta.url);

test('physical iOS packages use the embedded production asset pipeline', async () => {
    const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
    const command = packageJson.scripts['ios:device-build'];

    assert.match(command, /^tauri ios build\b/);
    assert.match(command, /--target aarch64\b/);
    assert.match(command, /--export-method debugging\b/);
    assert.doesNotMatch(command, /\bios dev\b|--no-dev-server\b/);
});

test('native build documentation warns against the broken offline dev package', async () => {
    const readme = await readFile(readmeUrl, 'utf8');

    assert.match(readme, /npm run ios:device-build/);
    assert.match(readme, /Do not package a device app with `tauri ios dev --no-dev-server`/);
    assert.match(readme, /embedded web build/);
});
