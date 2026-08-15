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
 *
 * Usage: node scripts/vendor-forward.mjs [--no-commit]
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
const out = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, ...opts }).toString().trim();

const UPSTREAMS = ['bw-circuit-ui', 'bw-board', 'sb3-creator'];
const tmp = mkdtempSync(path.join(tmpdir(), 'vendor-fwd-'));
const clones = {};
try {
    for (const repo of UPSTREAMS) {
        const dir = path.join(tmp, repo);
        sh(`git clone -q --depth 1 https://github.com/CrispStrobe/${repo} ${dir}`);
        clones[repo] = dir;
        console.log(`${repo} @ ${out(`git -C ${dir} rev-parse --short HEAD`)}`);
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
    const pins = UPSTREAMS.map((r) => `${r}@${out(`git -C ${clones[r]} rev-parse --short HEAD`)}`).join(', ');
    sh('git add overlay vendor-pins.json');
    sh(`git commit --author="CrispStrobe <cze+github@mailbox.org>" -m "vendor forward: ${pins}" -m "Coherent forward via scripts/vendor-forward.mjs: fresh upstream clones, all trees + pins from one state, integrate + build + all three browser gates green before commit."`);
    console.log('committed. Push when ready: git push origin main');
} finally {
    rmSync(tmp, { recursive: true, force: true });
}
