/**
 * ONE RESOLUTION OF "WHICH UPSTREAM TREE", FOR EVERY GATE THAT ASKS.
 *
 * Four copies of this logic existed before this module. vendor-identity.test.mjs
 * said of its own copy that "two resolutions of 'which upstream' would be two
 * answers, and the one that is wrong would be the one nobody re-read" -- and the
 * copy that comment denies existed 300 lines below it in the same file, plus one
 * in vendor-residue-ratchet.test.mjs and one in sb3-creator-vendor-identity.mjs.
 * The claim outlived the thing it described. The fourth copy had already cost a
 * real red: it applied the /tmp rule unconditionally, discarded an explicit
 * SB3_CREATOR_DIR under /tmp, and then skipped with "no sb3-creator checkout
 * found" while NAMING the directory it had just rejected.
 *
 * TWO RULES THIS ENCODES, both learned from reds, neither obvious from the code:
 *
 * 1. SPEAK vs JUDGE. A sibling checkout is a DIRECTORY, not a COMMIT. Only an
 *    explicit env-var dir whose HEAD equals the pin may decide a gate; anything
 *    else may report what it found and must skip BY NAME. Measured 2026-09-07:
 *    both siblings on the VPS resolved to a peer's feature branches, and the
 *    resulting red ("APPEARED: board.js, rp2040-bootrom.js") was a report about
 *    that peer's branch wearing this gate's name.
 *
 * 2. THE /tmp RULE IS ABOUT IMPLICIT SIBLINGS, NOT ABOUT AN EXPLICIT ANSWER.
 *    /tmp is world-writable, so a scratch tree left beside the repo is never
 *    silently adopted as "the upstream nobody named". But naming the env var IS
 *    somebody naming one, so an explicit dir is exempt from the rule -- which is
 *    what makes these gates usable outside CI.
 *
 * THE PROBE IS A PARAMETER, NOT A BRANCH. sb3-creator is the only tree whose
 * vendored files are lifted out of `src/utils` rather than `src`, and it is also
 * the only one that wants the checkout ROOT back rather than the probed subdir.
 * Both are per-repo data, so they live in REPO_LAYOUT and not in an `if`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const PINS = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8'));

/**
 * Per-repo facts the resolver needs. Adding a vendored tree means adding a row
 * here, not writing a fifth resolver -- which
 * test/one-upstream-resolver.test.mjs enforces.
 */
export const REPO_LAYOUT = Object.freeze({
    'bw-board': {envVar: 'BW_BOARD_DIR', probe: 'src'},
    'bw-circuit-ui': {envVar: 'BW_CIRCUIT_UI_DIR', probe: 'src'},
    'sb3-creator': {envVar: 'SB3_CREATOR_DIR', probe: 'src/utils'}
});

/** HEAD of a checkout and whether it equals the recorded pin for `repo`. */
export const headAtPin = (dir, repo, pins = PINS) => {
    const pin = pins[repo] ?? null;
    let head = null;
    try {
        head = execSync(`git -C ${JSON.stringify(dir)} rev-parse HEAD`,
            {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim();
    } catch { /* not a git checkout -- head stays null, atPin false */ }
    return {head, pin, atPin: Boolean(pin) && head === pin};
};

/**
 * Resolve the upstream checkout for `repo`.
 *
 * @returns {{root: string|null, dir: string|null, pinned: boolean,
 *            head: string|null, pin: string|null, atPin: boolean,
 *            candidates: string[], envVar: string}}
 *   `root` is the checkout root; `dir` is `root/<probe>`. `pinned` is true only
 *   when the env var named the tree AND its HEAD is the pin -- it does NOT mean
 *   merely that the variable is set.
 */
export const pinnedUpstream = (repo, {layout = REPO_LAYOUT, pins = PINS, root = ROOT} = {}) => {
    const spec = layout[repo];
    if (!spec) throw new Error(`pinnedUpstream: no REPO_LAYOUT row for ${repo}`);
    const {envVar, probe} = spec;
    const named = process.env[envVar]; // gate-shapes-allow: SPEAK/JUDGE split, see below
    const candidates = [named,
        path.resolve(root, `../../${repo}`),
        path.resolve(root, `../${repo}`)].filter(Boolean);
    const TMP = fs.realpathSync(os.tmpdir());
    const outsideTmp = (d) => {
        try { return !fs.realpathSync(d).startsWith(TMP); } catch { return false; }
    };
    const found = candidates
        .filter(d => fs.existsSync(path.join(d, probe)))
        .filter(d => named ? true : outsideTmp(d))[0] ?? null;
    // HEAD IS ALWAYS READ; ONLY JUDGING IS GATED. A tree that may not decide the
    // gate is still the tree the skip message has to NAME -- "a sibling is at
    // <sha> but the pin is <sha>" is the sentence that tells someone what to do,
    // and it cannot be written from a null. `pinned` is the judging predicate;
    // `atPin` alone is not, and copy D read `atPin` directly, which meant an
    // UNNAMED sibling that happened to sit at the pin would judge -- the exact
    // SPEAK/JUDGE rule its own doc comment claimed to obey.
    const {head, pin, atPin} = found
        ? headAtPin(found, repo, pins)
        : {head: null, pin: pins[repo] ?? null, atPin: false};
    return {
        root: found,
        dir: found ? path.join(found, probe) : null,
        pinned: Boolean(named) && atPin,
        // `named` exists so a skip message can say WHOSE head it is reporting.
        // Because head is now read even for an unnamed sibling, a message that
        // branches on `head` alone will write "BW_BOARD_DIR is at <sha>" when
        // BW_BOARD_DIR is unset and the sha belongs to a sibling nobody named.
        // That bug was written and caught here; branch on `named`, not `head`.
        named: Boolean(named),
        head, pin, atPin, candidates, envVar
    };
};
