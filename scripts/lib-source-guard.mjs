/**
 * Source-freshness guard for vendor sync scripts: a --dir source must not
 * be BEHIND its origin default branch. Syncing from a stale local worktree
 * once synced lite BACKWARD (deleted new components) — this makes that
 * mistake impossible rather than merely discouraged.
 *
 * "Not behind", not "equal": a feature branch strictly AHEAD of the default
 * contains everything the default has, so syncing from it can only move lite
 * forward. That is how unreleased work is vendored, and it is the normal case
 * once a repo has more than one active lane. Requiring equality refused it and
 * pushed people to --allow-stale, which skips the check altogether.
 *
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
        // The property worth enforcing is NOT "head equals default" — it is
        // "head is not BEHIND default", i.e. the source contains everything the
        // default branch has. A feature branch that is strictly AHEAD satisfies
        // that: syncing from it moves lite forward, which is the whole point of
        // vendoring unreleased work, and equality refused it.
        //
        // This matters more than it looks. The escape hatch is --allow-stale,
        // which skips the check ENTIRELY, so a guard that refuses safe syncs
        // does not make people careful — it teaches them the flag that turns
        // off the real protection too. Refusing correctly is what keeps the
        // hatch rare enough to mean something.
        let containsDefault = head === def;
        if (!containsDefault) {
            try {
                execSync(`git merge-base --is-ancestor ${def} ${head}`, { cwd: dir, stdio: 'ignore' });
                containsDefault = true;
            } catch { containsDefault = false; }
        }
        if (!containsDefault) {
            // Behind or diverged, and the distinction changes what to do, so
            // it is measured rather than left to the reader.
            let behind = false;
            try {
                execSync(`git merge-base --is-ancestor ${head} ${def}`, { cwd: dir, stdio: 'ignore' });
                behind = true;
            } catch { /* diverged */ }
            console.error(`REFUSED: source ${dir} is at ${head.slice(0, 8)}, which is `
                + `${behind ? 'BEHIND' : 'DIVERGED FROM'} origin default ${def.slice(0, 8)}.`);
            console.error(behind
                ? 'It is missing work the default branch has, and syncing would DELETE that work'
                : 'It lacks commits the default branch has, and syncing would delete them');
            console.error('from lite — which is exactly how a stale checkout once moved lite BACKWARD.');
            console.error(behind
                ? 'Pull, or use a fresh clone / scripts/vendor-forward.mjs.'
                : 'Merge the default branch into your source first, then sync. --allow-stale only if pinning deliberately.');
            process.exit(1);
        }
    } catch (e) {
        console.error(`REFUSED: cannot verify freshness of ${dir} (${String(e).split('\n')[0]}). Use vendor-forward.mjs or --allow-stale.`);
        process.exit(1);
    }
}
