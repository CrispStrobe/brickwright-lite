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
