import assert from 'node:assert/strict';
import {readFile, copyFile, mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
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


test('iOS preparation excludes the linked static archive from resources, including repeat builds', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'brickwright ios package-'));
    try {
        const app = path.join(temp, 'app');
        const scripts = path.join(app, 'scripts');
        const gen = path.join(app, 'src-tauri/gen/apple');
        const project = path.join(gen, 'fixture.xcodeproj');
        const frontend = path.join(temp, 'frontend');
        await Promise.all([mkdir(scripts, {recursive: true}), mkdir(project, {recursive: true}),
            mkdir(frontend, {recursive: true})]);
        await writeFile(path.join(frontend, 'index.html'), '<html>offline app</html>');
        await symlink(frontend, path.join(app, 'frontend-link'));
        await writeFile(path.join(app, 'src-tauri/tauri.conf.json'),
            JSON.stringify({build: {frontendDist: '../frontend-link'}}));
        const script = path.join(scripts, 'prepare-ios-device-build.mjs');
        await copyFile(new URL('../apps/tauri/scripts/prepare-ios-device-build.mjs', import.meta.url), script);
        const resource = '111111111111111111111111 /* libapp.a in Resources */';
        const framework = '222222222222222222222222 /* libapp.a in Frameworks */';
        const other = '333333333333333333333333 /* Assets.xcassets in Resources */';
        const pbxPath = path.join(project, 'project.pbxproj');
        await writeFile(pbxPath, `${resource} = {isa = PBXBuildFile;};\n` +
            `${framework} = {isa = PBXBuildFile;};\nfiles = (\n${resource},\n${framework},\n${other},\n);\n` +
            'shellScript = "npm run -- tauri ios xcode-script";\n');
        const prepare = () => {
            const result = spawnSync(process.execPath, [script], {encoding: 'utf8'});
            assert.equal(result.status, 0, result.stderr || result.stdout);
        };
        prepare();
        let pbx = await readFile(pbxPath, 'utf8');
        assert.doesNotMatch(pbx, /libapp\.a in Resources/);
        assert.ok(pbx.includes(framework), 'the static linker input must remain');
        assert.ok(pbx.includes(other), 'ordinary resources must remain');
        assert.equal(await readFile(path.join(gen, 'assets/index.html'), 'utf8'), '<html>offline app</html>');
        // Reinitializing a project with Externals populated can add the archive
        // again even though the Rust command is already correctly anchored.
        await writeFile(pbxPath, `${resource} = {isa = PBXBuildFile;};\n${pbx}`);
        prepare();
        pbx = await readFile(pbxPath, 'utf8');
        assert.doesNotMatch(pbx, /libapp\.a in Resources/);
        assert.ok(pbx.includes(framework));
        assert.ok(pbx.includes(other));
    } finally {
        await rm(temp, {recursive: true, force: true});
    }
});
