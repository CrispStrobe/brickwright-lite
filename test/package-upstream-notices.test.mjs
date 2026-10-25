import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {packageNotices, NOTICE_DIRS} from '../scripts/package-upstream-notices.mjs';

test('upstream notice bytes, source pins and both mirrors are deterministic and independently checked', () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'upstream-notices-'));
    try {
        const pins = {'bw-board': 'a'.repeat(40), 'bw-circuit-ui': 'b'.repeat(40)};
        const pinsFile = path.join(rootDir, 'vendor-pins.json');
        writeFileSync(pinsFile, JSON.stringify(pins));
        const licenses = {'bw-board': 'MIT License\n\nCopyright fixture\n', 'bw-circuit-ui': 'Mozilla Public License Version 2.0\n\nFixture body\n'};
        for (const [name, text] of Object.entries(licenses)) {
            const dir = path.join(rootDir, 'node_modules', name);
            mkdirSync(dir, {recursive: true});
            // Deliberately wrong UI metadata: authoritative license is the file.
            writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name, license: 'MIT'}));
            writeFileSync(path.join(dir, 'LICENSE'), text);
        }
        const options = {rootDir};
        assert.equal(packageNotices(options).files, 6);
        assert.deepEqual(packageNotices({...options, check: true}).findings, []);
        const target = path.join(rootDir, NOTICE_DIRS[0], 'bw-circuit-ui.MPL-2.0.txt');
        assert.equal(readFileSync(target, 'utf8'), licenses['bw-circuit-ui']);
        const sourcePath = path.join(rootDir, NOTICE_DIRS[0], 'bw-packages.sources.json');
        const initial = readFileSync(sourcePath);
        packageNotices(options);
        assert.deepEqual(readFileSync(sourcePath), initial);
        assert.equal(JSON.parse(initial).packages[1].sourceArchive, `https://github.com/CrispStrobe/bw-circuit-ui/archive/${pins['bw-circuit-ui']}.tar.gz`);
        const buildDir = path.join(rootDir, 'build');
        assert.throws(() => packageNotices({...options, buildDir}), /read-only and requires --check/);
        assert.equal(packageNotices({...options, check: true, buildDir}).findings.length, 3);
        cpSync(path.join(rootDir, NOTICE_DIRS[0]), path.join(buildDir, 'static/licenses'), {recursive: true});
        assert.deepEqual(packageNotices({...options, check: true, buildDir}).findings, []);
        assert.equal(packageNotices({...options, check: true, buildDir}).files, 9);
        for (const filename of ['bw-board.MIT.txt', 'bw-circuit-ui.MPL-2.0.txt', 'bw-packages.sources.json']) {
            const output = path.join(buildDir, 'static/licenses', filename);
            const original = readFileSync(output);
            writeFileSync(output, original.subarray(0, original.length - 1));
            const findings = packageNotices({...options, check: true, buildDir}).findings;
            assert.equal(findings.length, 1); assert.ok(findings[0].includes(`build/static/licenses/${filename}`));
            writeFileSync(output, original);
        }
        writeFileSync(pinsFile, JSON.stringify({...pins, 'bw-board': 'c'.repeat(40)}));
        assert.equal(packageNotices({...options, check: true}).findings.filter(f => f.includes('bw-packages.sources.json')).length, 2);
        writeFileSync(pinsFile, JSON.stringify(pins));
        writeFileSync(target, 'corrupted output');
        assert.match(packageNotices({...options, check: true}).findings.join('\n'), /overlay.*bw-circuit-ui.MPL-2.0.txt/);
        packageNotices(options);
        rmSync(path.join(rootDir, NOTICE_DIRS[1], 'bw-board.MIT.txt'));
        assert.match(packageNotices({...options, check: true}).findings.join('\n'), /packages\/scratch-gui.*bw-board.MIT.txt: missing/);
        packageNotices(options);
        writeFileSync(path.join(rootDir, 'node_modules/bw-board/LICENSE'), licenses['bw-board'] + 'changed body\n');
        assert.match(packageNotices({...options, check: true}).findings.join('\n'), /bw-board.MIT.txt: stale/);
        writeFileSync(path.join(rootDir, 'node_modules/bw-circuit-ui/LICENSE'), 'MIT License\n');
        assert.throws(() => packageNotices({...options, check: true}), /bw-circuit-ui: LICENSE.*MPL-2.0/);
        writeFileSync(path.join(rootDir, 'node_modules/bw-circuit-ui/LICENSE'), licenses['bw-circuit-ui']);
        writeFileSync(path.join(rootDir, 'node_modules/bw-board/package.json'), '{"name":"wrong-package"}');
        assert.throws(() => packageNotices(options), /bw-board: installed package name mismatch/);
        writeFileSync(pinsFile, JSON.stringify({...pins, 'bw-board': 'main'}));
        assert.throws(() => packageNotices({...options, check: true}), /bw-board: expected full commit SHA/);
    } finally { rmSync(rootDir, {recursive: true, force: true}); }
});
