/**
 * Source-freshness guard for vendor sync scripts: a --dir source must
 * match its origin default branch HEAD. Syncing from a stale local
 * worktree once synced lite BACKWARD (deleted new components) — this
 * makes that mistake impossible rather than merely discouraged.
 * Escape hatch for deliberate pinning: --allow-stale.
 */
import { execSync } from 'node:child_process';

export function guardSource(dir, argv = process.argv) {
    if (argv.includes('--allow-stale')) return;
    const out = (cmd) => execSync(cmd, { cwd: dir }).toString().trim();
    try {
        execSync('git fetch -q origin', { cwd: dir, stdio: 'ignore' });
        const head = out('git rev-parse HEAD');
        let def;
        // `git rev-parse <bad-ref>` ECHOES the ref on stdout before failing, and the
        // `||` chain kept both lines, so a checkout with no origin/HEAD (common: it
        // is only set by `clone`, never by `remote add`) produced def =
        // "origin/master\n<sha>" and the guard refused every source with
        // "origin default is origin/m". `--verify -q` is the form that stays silent
        // and returns nothing, so the fallback actually falls back.
        for (const ref of ['origin/HEAD', 'origin/main', 'origin/master']) {
            try { def = out(`git rev-parse --verify -q ${ref}`); } catch { continue; }
            if (def) break;
        }
        if (!def) throw new Error('no origin/HEAD, origin/main or origin/master');
        if (head !== def) {
            console.error(`REFUSED: source ${dir} is at ${head.slice(0, 8)} but origin default is ${def.slice(0, 8)}.`);
            console.error('Syncing from a stale checkout once moved lite BACKWARD. Use a fresh clone,');
            console.error('scripts/vendor-forward.mjs (which clones for you), or --allow-stale if pinning deliberately.');
            process.exit(1);
        }
    } catch (e) {
        console.error(`REFUSED: cannot verify freshness of ${dir} (${String(e).split('\n')[0]}). Use vendor-forward.mjs or --allow-stale.`);
        process.exit(1);
    }
}
