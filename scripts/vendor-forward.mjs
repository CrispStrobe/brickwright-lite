#!/usr/bin/env node
/**
 * vendor-forward — THE one command for advancing lite's vendored trees.
 *
 * Today's staleness traps, each closed by construction:
 * - syncing from a stale local worktree (it happened; it synced lite
 *   BACKWARD): this script clones fresh --depth 1 upstream masters to
 *   a temp dir. No --dir escape hatch.
 * - sidecars/designer/pins from different states: all trees sync from
 *   the SAME clone set, pins update atomically at the end.
 * - shipping unverified: integrate + build + all three browser gates
 *   run BEFORE the commit is created; any failure leaves the tree
 *   dirty for inspection and exits nonzero.
 * - forwarding to a state nobody can name: the clone took no ref at
 *   all, so "whatever the default branch was at the moment this ran"
 *   was the entire specification of what got vendored, and the run
 *   reported it in SHORT shas. Now each upstream's head is resolved to
 *   a full 40-hex sha FIRST (one `git ls-remote` per repo), the clone
 *   is checked out AT that sha, and HEAD is asserted to equal it — so
 *   a push landing between the resolve and the clone is caught rather
 *   than silently taken.
 *
 * Usage:
 *   node scripts/vendor-forward.mjs [--no-commit]
 *   node scripts/vendor-forward.mjs --at bw-board=<sha> --at sb3-creator=<sha>
 *
 * `--at` makes the run REPRODUCIBLE: re-forwarding to the exact state a
 * previous run took is what turns a vendor bump from an event into an
 * artifact you can re-derive. With no `--at`, each upstream advances to
 * its current default-branch head.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
const out = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, ...opts }).toString().trim();

const UPSTREAMS = ['bw-circuit-ui', 'bw-board', 'sb3-creator'];
const FULL_SHA = /^[0-9a-f]{40}$/;

// --at <repo>=<sha>, repeatable.
const pinned = {};
for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] !== '--at') continue;
    const [repo, sha] = String(process.argv[i + 1] || '').split('=');
    if (!UPSTREAMS.includes(repo)) throw new Error(`--at: unknown upstream ${JSON.stringify(repo)} (expected one of ${UPSTREAMS.join(', ')})`);
    if (!FULL_SHA.test(sha || '')) throw new Error(`--at ${repo}: ${JSON.stringify(sha)} is not a 40-hex sha. An abbreviation is not an immutable name.`);
    pinned[repo] = sha;
}

const tmp = mkdtempSync(path.join(tmpdir(), 'vendor-fwd-'));
const clones = {};
const shas = {};
try {
    for (const repo of UPSTREAMS) {
        const dir = path.join(tmp, repo);
        const url = `https://github.com/CrispStrobe/${repo}`;
        // Resolve the NAME to a sha before fetching content. `ls-remote HEAD`
        // reads the default branch's tip from the repository itself, which
        // also removes the master-vs-main guessing these repos disagree about.
        let want = pinned[repo];
        if (!want) {
            const line = out(`git ls-remote ${url} HEAD`);
            want = line.split(/\s+/)[0];
            if (!FULL_SHA.test(want)) throw new Error(`ls-remote ${url} HEAD returned ${JSON.stringify(line)}`);
        }
        // --depth 1 of a specific sha: a bare `clone` would take whatever the
        // default branch is NOW, which is a second, unrecorded resolution.
        sh(`git init -q ${dir}`);
        sh(`git -C ${dir} remote add origin ${url}`);
        sh(`git -C ${dir} fetch -q --depth 1 origin ${want}`);
        sh(`git -C ${dir} checkout -q --detach FETCH_HEAD`);
        const got = out(`git -C ${dir} rev-parse HEAD`);
        // The assertion the old form could not make: what was RESOLVED is what
        // is CHECKED OUT. Without it a push between the two steps is invisible.
        if (got !== want) throw new Error(`${repo}: resolved ${want} but the checkout is at ${got}`);
        clones[repo] = dir;
        shas[repo] = got;
        console.log(`${repo} @ ${got}${pinned[repo] ? ' (--at)' : ' (default-branch head)'}`);
    }

    // All syncs from the SAME clone set.
    sh(`node scripts/sync-bw-circuit-ui.mjs --dir ${clones['bw-circuit-ui']}`);
    sh(`node scripts/sync-parts-data.mjs --dir ${clones['bw-circuit-ui']}`);
    sh(`node scripts/sync-bw-board.mjs --dir ${clones['bw-board']}`);
    sh(`node scripts/sync-sb3creator.mjs --dir ${clones['sb3-creator']}`);
    sh(`node scripts/sync-examples.mjs --dir ${clones['sb3-creator']}`);

    if (out('git status --porcelain -- overlay vendor-pins.json') === '') {
        console.log('nothing to forward — vendored trees already match upstream.');
        process.exit(0);
    }

    sh('npm run integrate');
    // The unit suite runs BEFORE the expensive build: a vendored-tree
    // change that breaks a lite test must fail here, not in CI after the
    // push (2026-08-15: the mcu footprint orientation flip landed green
    // through all three browser gates and then failed CI on a unit test
    // asserting the old geometry — this line closes that hole).
    sh('npm test');
    sh('npm run build', { cwd: path.join(ROOT, 'packages', 'scratch-gui'), env: { ...process.env, NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=2560' } });

    // Gates against the fresh build.
    sh('pkill -f "http.server 8617" || true');
    execSync('python3 -m http.server 8617 &', { cwd: path.join(ROOT, 'packages', 'scratch-gui', 'build'), stdio: 'ignore', shell: '/bin/bash' });
    execSync('sleep 2');
    for (const gate of ['verify-circuit-ux', 'verify-view-buttons', 'verify-editor']) {
        sh(`PROOF_URL=http://localhost:8617/ node scripts/${gate}.mjs`);
    }
    sh('pkill -f "http.server 8617" || true');

    if (process.argv.includes('--no-commit')) {
        console.log('gates green; --no-commit requested, leaving staged-ready tree.');
        process.exit(0);
    }
    // Full shas in the commit message. A short sha in the permanent record is
    // the thing a later reader copies into a pin, and it is not a name anything
    // can fetch by with certainty.
    const pins = UPSTREAMS.map((r) => `${r}@${shas[r]}`).join('\n');
    sh('git add overlay vendor-pins.json');
    const subject = UPSTREAMS.map((r) => `${r}@${shas[r].slice(0, 12)}`).join(', ');
    sh(`git commit --author="CrispStrobe <cze+github@mailbox.org>" -m "vendor forward: ${subject}" -m ${JSON.stringify(
        'Coherent forward via scripts/vendor-forward.mjs: each upstream resolved to a sha, '
        + 'fetched AT that sha with the checkout asserted to match, all trees + pins from one '
        + 'state, integrate + build + all three browser gates green before commit.\n\n'
        + 'Re-derive this exact state with:\n  node scripts/vendor-forward.mjs '
        + UPSTREAMS.map((r) => `--at ${r}=${shas[r]}`).join(' ')
        + `\n\n${pins}`)}`);
    console.log('committed. Push when ready: git push origin main');
} finally {
    rmSync(tmp, { recursive: true, force: true });
}
