import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {githubIdentityMatches, verifyInstalledPackage, verifySingleEngineResolution} from '../scripts/package-provenance.mjs';

test('Git identity accepts only exact supported host/owner/package/commit forms', () => {
    const sha = 'a'.repeat(40), url = `git+ssh://git@github.com/CrispStrobe/bw-board.git#${sha}`;
    assert.equal(githubIdentityMatches(url, 'CrispStrobe', 'bw-board', sha), true);
    for (const bad of [url.replace('github.com', 'github.com.evil'), url.replace('bw-board', 'bw-circuit-ui'), url + '?x', url.replace('CrispStrobe', 'Other')]) {
        assert.equal(githubIdentityMatches(bad, 'CrispStrobe', 'bw-board', sha), false);
    }
});

test('each UI resolves its own verified sibling engine, never a nested or ancestor shadow', () => {
    const temp = mkdtempSync(path.join(tmpdir(), 'engine-resolution-'));
    try {
        const roots = [path.join(temp, 'node_modules'), path.join(temp, 'gui/node_modules')];
        const engine = dir => {
            mkdirSync(dir, {recursive: true});
            writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'bw-board', exports: {'./package.json': './package.json'}}));
        };
        for (const root of roots) {
            engine(path.join(root, 'bw-board'));
            mkdirSync(path.join(root, 'bw-circuit-ui'), {recursive: true});
            writeFileSync(path.join(root, 'bw-circuit-ui/package.json'), '{"name":"bw-circuit-ui"}');
            const result = verifySingleEngineResolution(root);
            assert.ok(Object.isFrozen(result));
            assert.equal(result.engineManifest, path.join(root, 'bw-board/package.json'));
        }
        // Same metadata and bytes still constitute another physical engine instance.
        const shadow = path.join(roots[1], 'bw-circuit-ui/node_modules/bw-board');
        engine(shadow);
        assert.throws(() => verifySingleEngineResolution(roots[1]), /shadow bw-board/);
        assert.doesNotThrow(() => verifySingleEngineResolution(roots[0]));
        rmSync(shadow, {recursive: true});
        rmSync(path.join(roots[1], 'bw-board'), {recursive: true});
        // Do not accept ancestor fallback merely because Node can resolve it.
        assert.throws(() => verifySingleEngineResolution(roots[1]), /ENOENT/);
    } finally { rmSync(temp, {recursive: true, force: true}); }
});

test('offline pinned pack rejects modified installed source even when metadata still agrees', () => {
    const temp = mkdtempSync(path.join(tmpdir(), 'provenance-fixture-'));
    try {
        const repoDir = path.join(temp, 'repo'), installedDir = path.join(temp, 'installed');
        mkdirSync(repoDir); mkdirSync(installedDir);
        // git is an explicit build-tool prerequisite, not an emulated runtime
        // oracle. This fixture creates its own isolated repository; no ambient
        // checkout supplies expected bytes. gate-shapes-allow
        const git = args => execFileSync('git', ['-C', repoDir, ...args], {encoding: 'utf8'}).trim();
        git(['init', '-q']); git(['remote', 'add', 'origin', 'https://github.com/CrispStrobe/bw-board.git']);
        writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({name: 'bw-board', version: '0.0.1', files: ['src'], scripts: {prepack: 'exit 77', prepare: 'exit 78'}}) + '\n');
        mkdirSync(path.join(repoDir, 'src'));
        writeFileSync(path.join(repoDir, 'src', 'index.js'), 'export const actual = 1;\n');
        git(['add', 'package.json', 'src']);
        git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture']);
        const sha = git(['rev-parse', 'HEAD']);
        cpSync(path.join(repoDir, 'package.json'), path.join(installedDir, 'package.json'));
        cpSync(path.join(repoDir, 'src'), path.join(installedDir, 'src'), {recursive: true});
        const options = {repoDir, installedDir, name: 'bw-board', sha};
        // Dirty source checkout is deliberately ignored; the commit is authority.
        writeFileSync(path.join(repoDir, 'src', 'index.js'), 'dirty checkout ignored\n');
        const result = verifyInstalledPackage(options);
        assert.equal(result.files, 2); assert.ok(Object.isFrozen(result));
        writeFileSync(path.join(installedDir, 'src', 'index.js'), 'export const actual = 2;\n');
        assert.equal(JSON.parse(readFileSync(path.join(installedDir, 'package.json'))).version, '0.0.1');
        assert.throws(() => verifyInstalledPackage(options), /modified src\/index.js/);
        writeFileSync(path.join(installedDir, 'src', 'index.js'), 'export const actual = 1;\n');
        writeFileSync(path.join(installedDir, 'extra.js'), 'injected');
        assert.throws(() => verifyInstalledPackage(options), /unexpected extra.js/);
        rmSync(path.join(installedDir, 'extra.js'));
        rmSync(path.join(installedDir, 'src', 'index.js'));
        assert.throws(() => verifyInstalledPackage(options), /missing src\/index.js/);
        symlinkSync(path.join(repoDir, 'src', 'index.js'), path.join(installedDir, 'src', 'index.js'));
        assert.throws(() => verifyInstalledPackage(options), /unsupported package symlink/);
        for (const origin of ['https://evil.example/CrispStrobe/bw-board.git', 'https://github.com/CrispStrobe/bw-circuit-ui.git']) {
            git(['remote', 'set-url', 'origin', origin]);
            assert.throws(() => verifyInstalledPackage(options), /source origin does not match/);
        }
    } finally { rmSync(temp, {recursive: true, force: true}); }
});
