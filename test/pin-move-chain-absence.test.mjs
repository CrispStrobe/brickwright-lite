// A missing blob is an ABSENCE, not a pin defect.
//
// CI checks out a PARTIAL (blobless) clone. `git log -p` reads file content,
// which makes git fetch blobs lazily from the promisor remote; when that fetch
// fails, test/pin-move-chain.test.mjs throws while being CONSTRUCTED and the
// raw git error reads as though this repository's pins are broken. Nothing
// about the pins was examined.
//
// The classifier is fed THE ACTUAL STDERR observed on 2026-09-23 (build job of
// PR #298), not a message invented to match the regex — a detector tested only
// against its own author's phrasing is a detector that recognises phrasing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {explainGitFailure} from './helpers/git-absence.mjs';

const REAL = `Command failed: git -C /home/runner/work/brickwright-lite/brickwright-lite log -p --format=COMMIT %H %ad --date=short -- vendor-pins.json
fatal: unable to access 'https://github.com/CrispStrobe/brickwright-lite/': server certificate verification failed. CAfile: none CRLfile: none
fatal: could not fetch 98f9b86e360254dabadaa778cdbfbba93872a5d6 from promisor remote`;

test('THE REAL FAILURE is recognised as an absence', () => {
    const why = explainGitFailure(REAL);
    assert.ok(why, 'the observed CI stderr must be classified');
    assert.match(why, /PARTIAL \(blobless\) clone/);
    assert.match(why, /NOTHING ABOUT THE PINS WAS EXAMINED/,
        'the message must say it examined nothing, or it reads as a verdict on the pins');
    assert.match(why, /promisor remote/, 'and it must carry the original error for anyone chasing it');
});

test('a REAL pin defect is NOT explained away', () => {
    // The failure this suite exists to catch must never be relabelled as
    // infrastructure — that would turn a genuine red into a shrug.
    for (const notInfra of [
        'AssertionError: expected 44d23f88… to equal b7bfd2b7…',
        'Command failed: git -C /x rev-list --count HEAD\nfatal: not a git repository',
        ''
    ]) {
        assert.equal(explainGitFailure(notInfra), null, `must not explain away: ${notInfra.slice(0, 40)}`);
    }
});

test('each half of the real message is enough on its own', () => {
    // GitHub does not promise both lines; either alone means the same thing.
    assert.ok(explainGitFailure('fatal: could not fetch abc from promisor remote'));
    assert.ok(explainGitFailure("fatal: unable to access 'https://github.com/x/y/'"));
});
