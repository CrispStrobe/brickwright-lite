// Every file that exists BOTH in overlay/scratch-gui and as a TRACKED file under
// packages/scratch-gui must be byte-identical at HEAD.
//
// Why: scripts/integrate.mjs copies overlay/ over packages/ in every real build,
// so for any divergent pair one side's edit is silently dead — an overlay edit
// makes the tracked packages copy a stale lie, and a packages edit is clobbered
// by the next integrate. Measured 2026-08-29: 16 pairs had diverged (15 stale
// mirrors, one CRLF-only). Either resolution keeps this green: edit overlay and
// refresh the tracked mirror in the same commit, or stop tracking the packages
// copy. What may not happen is the two sides telling different stories.
//
// The comparison reads HEAD blobs, not the working tree, because CI runs
// integrate before the tests — a working-tree comparison would be vacuously
// green there forever.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

// AMBIENT-BINDING, triaged 2026-09-02 and KEPT. `git` from PATH is the one ambient tool whose
// identity is not in question here: the gate asks git for THIS repository's own tracked blobs,
// so a different git would still answer about the same objects, and an absent one throws
// ENOENT rather than passing. Contrast a compiler or a simulator, where a different binary
// silently produces a different verdict.
// gate-shapes-allow
const git = (...args) => execFileSync('git', args, {encoding: 'utf8', maxBuffer: 1 << 28});

test('overlay/packages dual-tracked pairs are identical at HEAD', () => {
    const blobs = tree => {
        const map = new Map();
        for (const line of git('ls-tree', '-r', `HEAD:${tree}`).split('\n')) {
            if (!line) continue;
            const [meta, path] = line.split('\t');
            map.set(path, meta.split(' ')[2]);
        }
        return map;
    };
    const overlay = blobs('overlay/scratch-gui');
    const packages = blobs('packages/scratch-gui');
    const divergent = [];
    for (const [path, sha] of overlay) {
        const other = packages.get(path);
        if (other && other !== sha) divergent.push(path);
    }
    assert.deepStrictEqual(
        divergent, [],
        `${divergent.length} overlay/packages pair(s) diverge at HEAD — ` +
        `integrate.mjs will silently clobber the packages side. Either refresh ` +
        `the tracked packages mirror from overlay in this commit, or un-track ` +
        `the packages copy.`
    );
});

const RAM_WORDS = 'src/lib/bw-board/i8086-ram-words.js';

const assertUpstreamOwnedPair = ({overlay, packages, liteAuthored}) => {
    assert.ok(overlay.has(RAM_WORDS), `${RAM_WORDS} is missing from the tracked overlay`);
    assert.ok(packages.has(RAM_WORDS), `${RAM_WORDS} is imported by the tracked i8086-machine.js ` +
        'but missing from the tracked packages mirror; a clean checkout must not depend on integrate ' +
        'creating an upstream-owned module');
    assert.equal(packages.get(RAM_WORDS), overlay.get(RAM_WORDS),
        `${RAM_WORDS} differs between its tracked overlay and packages copies`);
    assert.equal(liteAuthored.has(path.basename(RAM_WORDS)), false,
        `${path.basename(RAM_WORDS)} exists at the recorded bw-board pin and must not be claimed as lite-authored`);
};

test('the upstream-owned i8086 RAM helper is a tracked package pair', () => {
    const blobs = tree => new Map(git('ls-files', '-s', `${tree}/`).split('\n')
        .filter(Boolean)
        .map(line => {
            const [meta, file] = line.split('\t');
            return [file.slice(tree.length + 1), meta.split(' ')[1]];
        }));
    const md = fs.readFileSync('docs/VENDOR-DIVERGENCE-I8086-MACHINE.md', 'utf8');
    const manifest = JSON.parse(md.match(/```json\n([\s\S]*?)\n```/)[1]);
    assertUpstreamOwnedPair({
        overlay: blobs('overlay/scratch-gui'),
        packages: blobs('packages/scratch-gui'),
        liteAuthored: new Set(Object.keys(manifest.liteAuthored.files))
    });
});

test('i8086 RAM ownership contract rejects missing, mismatched and authored mutations', () => {
    const good = {
        overlay: new Map([[RAM_WORDS, 'same']]),
        packages: new Map([[RAM_WORDS, 'same']]),
        liteAuthored: new Set()
    };
    assert.doesNotThrow(() => assertUpstreamOwnedPair(good));
    assert.throws(() => assertUpstreamOwnedPair({...good, packages: new Map()}), /missing from the tracked packages/);
    assert.throws(() => assertUpstreamOwnedPair({...good,
        packages: new Map([[RAM_WORDS, 'different']])}), /differs between/);
    assert.throws(() => assertUpstreamOwnedPair({...good,
        liteAuthored: new Set([path.basename(RAM_WORDS)])}), /must not be claimed as lite-authored/);
});
