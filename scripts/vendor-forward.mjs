#!/usr/bin/env node
/**
 * vendor-forward — THE one command for advancing lite's vendored trees.
 *
 * Today's staleness traps, each closed by construction:
 * - syncing from a stale local worktree (it happened; it synced lite
 *   BACKWARD): this script clones fresh --depth 1 upstream masters to
 *   a temp dir. No --dir escape hatch.
 * - sidecars/designer/pins from different states: all inputs come from the
 *   SAME verified clone set; root and GUI installed bytes are compared with
 *   those immutable objects before notices are generated. Updates are NOT
 *   atomic: a failure leaves a dirty dedicated worktree, never a green commit.
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
 *
 * Requires a clean dedicated worktree and the package migration tools. BIOS
 * byte changes require manual review rather than an automatic boot-ROM swap.
 * Pin-derived ROM provenance, census, reports, notices and tracked app mirrors
 * are refreshed; unexpected changed paths refuse before any staging. Generated
 * packages/scratch-gui/examples copies remain intentionally untracked.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import {fileURLToPath} from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {quote, parseForwardPins, refreshForwardPackages, verifyForwardBuild, selectForwardOutputs, forwardMirror} from './lib/vendor-forward-packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
const out = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, ...opts }).toString().trim();

const UPSTREAMS = ['bw-circuit-ui', 'bw-board', 'sb3-creator'];
const FULL_SHA = /^[0-9a-f]{40}$/;

// --at <repo>=<sha>, repeatable.
const pinned = parseForwardPins(process.argv.slice(2));

const tmp = mkdtempSync(path.join(tmpdir(), 'vendor-fwd-'));
const clones = {};
const shas = {};
let server;
try {
    if (out('git status --porcelain --untracked-files=all')) {
        throw new Error('Forward requires a clean dedicated worktree; preserve/commit existing work first.');
    }
    for (const file of ['package-provenance.mjs', 'package-upstream-notices.mjs', 'sync-i8086-demo-roms.mjs', 'verify-emitted-native-broker-proof.mjs']) {
        if (!existsSync(path.join(ROOT, 'scripts', file))) throw new Error(`Forward requires scripts/${file}; integrate the package migration tools first.`);
    }
    if (!readFileSync(path.join(ROOT, 'scripts/pin-packages.mjs'), 'utf8').includes('--verify-installed')) {
        throw new Error('Forward requires the installed-content verifier, not the legacy metadata-only pin tool.');
    }
    const oldPins = JSON.parse(readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8'));
    for (const repo of UPSTREAMS) {
        const dir = path.join(tmp, repo);
        const url = `https://github.com/CrispStrobe/${repo}.git`;
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
        sh(`git init -q ${quote(dir)}`);
        sh(`git -C ${quote(dir)} remote add origin ${url}`);
        sh(`git -C ${quote(dir)} fetch -q --depth 1 origin ${want}`);
        sh(`git -C ${quote(dir)} checkout -q --detach FETCH_HEAD`);
        const got = out(`git -C ${quote(dir)} rev-parse HEAD`);
        // The assertion the old form could not make: what was RESOLVED is what
        // is CHECKED OUT. Without it a push between the two steps is invisible.
        if (got !== want) throw new Error(`${repo}: resolved ${want} but the checkout is at ${got}`);
        // BIOS provenance and sb3 three-way bases need real ancestry. Fetch
        // only the already resolved object, not a new branch tip. Refuse a
        // divergent/missing old source before any application pin moves.
        if (repo !== 'bw-circuit-ui') {
            if (out(`git -C ${quote(dir)} rev-parse --is-shallow-repository`) === 'true') {
                sh(`git -C ${quote(dir)} fetch -q --unshallow --no-tags origin ${want}`);
            }
            if (!FULL_SHA.test(oldPins[repo] || '')) throw new Error(`${repo}: invalid current pin`);
            if (pinned[repo] && oldPins[repo] !== want) {
                sh(`git -C ${quote(dir)} fetch -q --no-tags origin ${oldPins[repo]}`);
            }
            sh(`git -C ${quote(dir)} cat-file -e ${oldPins[repo]}^{commit}`);
            if (!pinned[repo]) sh(`git -C ${quote(dir)} merge-base --is-ancestor ${oldPins[repo]} ${want}`);
            if (out(`git -C ${quote(dir)} rev-parse HEAD`) !== want) throw new Error(`${repo}: history fetch moved HEAD`);
        }
        clones[repo] = dir;
        shas[repo] = got;
        console.log(`${repo} @ ${got}${pinned[repo] ? ' (--at)' : ' (default-branch head)'}`);
    }

    // All syncs from the SAME clone set.
    // --pin: this tool exists to move the pins; a bare sync refuses to (lib-pin.mjs).
    // bw-circuit-ui and bw-board are packages: record the pins, then let
    // pin-packages.mjs derive the package.json specs and reinstall.
    for (const repo of ['bw-circuit-ui', 'bw-board']) {
        sh(`node scripts/pin-packages.mjs --set ${repo}=${shas[repo]} --pin`);
    }
    sh(`node scripts/sync-sb3creator.mjs --dir ${quote(clones['sb3-creator'])} --pin`);
    sh(`node scripts/sync-examples.mjs --dir ${quote(clones['sb3-creator'])} --pin`);

    refreshForwardPackages(sh, {root: ROOT, clones});
    // The unit suite runs BEFORE the expensive build: a vendored-tree
    // change that breaks a lite test must fail here, not in CI after the
    // push (2026-08-15: the mcu footprint orientation flip landed green
    // through all three browser gates and then failed CI on a unit test
    // asserting the old geometry — this line closes that hole).
    sh('npm test');
    sh('npm run check:load');
    sh('npm run build', { cwd: path.join(ROOT, 'packages', 'scratch-gui'), env: { ...process.env, NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=2560' } });
    verifyForwardBuild(sh, {root: ROOT});

    // Gates against the fresh build.
    // A private ephemeral listener, owned by this invocation. Never kill a
    // peer's server by matching its command line or claim a port it owns.
    server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'], {
        cwd: path.join(ROOT, 'packages/scratch-gui/build'), stdio: ['ignore', 'pipe', 'pipe']
    });
    const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('owned preview server did not become ready')), 10000);
        const done = (error, port) => { clearTimeout(timer); error ? reject(error) : resolve(port); };
        let output = '';
        server.stdout.on('data', data => {
            output += data.toString();
            const match = /Serving HTTP on .* port (\d+)/.exec(output);
            if (match) done(null, Number(match[1]));
        });
        server.on('error', error => done(error));
        server.on('exit', code => done(new Error(`owned preview server exited ${code}`)));
        server.stderr.on('data', data => process.stderr.write(data));
    });
    for (const gate of ['verify-circuit-ux', 'verify-view-buttons', 'verify-editor']) {
        sh(`PROOF_URL=http://127.0.0.1:${port}/ node scripts/${gate}.mjs`);
    }

    const changed = execSync('git diff --name-only --no-renames -z HEAD', {cwd: ROOT}).toString().split('\0').filter(Boolean);
    const added = execSync('git ls-files --others --exclude-standard -z', {cwd: ROOT}).toString().split('\0').filter(Boolean);
    const outputs = selectForwardOutputs([...changed, ...added]);
    for (const file of [...outputs]) {
        const mirror = forwardMirror(file);
        if (!mirror || !existsSync(path.join(ROOT, file))) continue;
        if (!existsSync(path.join(ROOT, mirror)) || !readFileSync(path.join(ROOT, file)).equals(readFileSync(path.join(ROOT, mirror)))) {
            throw new Error(`Forward refused stale/missing app mirror: ${mirror}`);
        }
        if (!outputs.includes(mirror)) outputs.push(mirror);
    }
    if (!outputs.length) { console.log('nothing to forward; installed payloads and all gates verified.'); }

    if (process.argv.includes('--no-commit')) {
        console.log('gates green; --no-commit requested, leaving reviewed output paths unstaged.');
    } else if (outputs.length) {
    // Full shas in the commit message. A short sha in the permanent record is
    // the thing a later reader copies into a pin, and it is not a name anything
    // can fetch by with certainty.
    const pins = UPSTREAMS.map((r) => `${r}@${shas[r]}`).join('\n');
    sh(`git add -f -- ${outputs.map(quote).join(' ')}`);
    const subject = UPSTREAMS.map((r) => `${r}@${shas[r].slice(0, 12)}`).join(', ');
    sh(`git commit --author="CrispStrobe <cze+github@mailbox.org>" -m "vendor forward: ${subject}" -m ${quote(
        'Coherent forward via scripts/vendor-forward.mjs: each upstream resolved to a sha, '
        + 'fetched AT that sha with the checkout asserted to match, all trees + pins from one '
        + 'state, integrate + build + all three browser gates green before commit.\n\n'
        + 'Re-derive this exact state with:\n  node scripts/vendor-forward.mjs '
        + UPSTREAMS.map((r) => `--at ${r}=${shas[r]}`).join(' ')
        + `\n\n${pins}\n\nClaude-Session: vendor-forward-script`)}`);
    console.log('committed locally. Review the commit, then choose an explicit push destination.');
    }
} finally {
    if (server && server.exitCode === null) server.kill('SIGTERM');
    rmSync(tmp, { recursive: true, force: true });
}
