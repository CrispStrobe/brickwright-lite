import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const packageJsonUrl = new URL('../apps/tauri/package.json', import.meta.url);
const readmeUrl = new URL('../README.md', import.meta.url);

test('physical iOS packages use the embedded production asset pipeline', async () => {
    const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
    const command = packageJson.scripts['ios:device-build'];
    const prepare = packageJson.scripts['preios:device-build'];

    assert.match(prepare, /prepare-ios-device-build\.mjs/,
        'a symlinked gen\/ directory must not move npm away from apps\/tauri');
    assert.match(command, /^tauri ios build\b/);
    assert.match(command, /--target aarch64\b/);
    assert.match(command, /--export-method debugging\b/);
    assert.doesNotMatch(command, /\bios dev\b|--no-dev-server\b/);
});

test('iOS preparation embeds a symlinked frontend build into generated assets', async () => {
    const prepareScript = await readFile(
        new URL('../apps/tauri/scripts/prepare-ios-device-build.mjs', import.meta.url),
        'utf8'
    );

    assert.match(prepareScript, /realpathSync\(frontendDist\)/);
    assert.match(prepareScript, /spawnSync\('\/usr\/bin\/rsync'/);
    assert.match(prepareScript, /'--delete'/);
    assert.match(prepareScript, /join\(generatedAssets, 'index\.html'\)/);
});

test('native build documentation warns against the broken offline dev package', async () => {
    const readme = await readFile(readmeUrl, 'utf8');

    assert.match(readme, /npm run ios:device-build/);
    assert.match(readme, /Do not package a device app with `tauri ios dev --no-dev-server`/);
    assert.match(readme, /embedded web build/);
});
