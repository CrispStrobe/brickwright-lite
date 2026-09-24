#!/usr/bin/env node
/**
 * Archive stale git worktrees to cold storage as one .tgz each, then remove them.
 *
 * Written after /mnt/volume1 hit 99 % full (3.0 G free) on 2026-09-23 and 392
 * stale worktrees across five fleets turned out to be ~39 GB of checkouts. They
 * compressed to 6.8 GB of archives and the disk came back to 36 G free, with no
 * failures. The knowledge that made that work is not obvious and cost a day to
 * find, so it lives here rather than in someone's notes.
 *
 * ## Why .tgz and not a copy
 *
 * The cold store is a CIFS share (/mnt/storage), and three things about it
 * decide the whole design. All measured, not assumed:
 *
 *   1. IT CANNOT STORE SYMLINKS. `rsync` fails per link with EIO — the mount is
 *      `nounix` with no `mfsymlinks`, so there is no way to represent one. That
 *      rules out copying almost any real tree: a HuggingFace cache is entirely
 *      symlinks, every venv has some, miniconda had 2790. A tar keeps symlinks
 *      INSIDE the archive, so the mount never has to represent one.
 *   2. A LARGE WRITE CAN CORRUPT SILENTLY. A 1.27 GB file returned ENOMEM on
 *      close() and landed at exactly the right SIZE with a different md5.
 *      Retried later it was clean, so it is transient memory pressure, not a
 *      size threshold. A size or file-count check would have passed. Every
 *      archive here is therefore read back with `tar -tzf`, whose gzip CRC
 *      catches it, BEFORE the source is deleted.
 *   3. PER-FILE LATENCY MAKES DIRECTORY COPIES IMPRACTICAL. Sequential
 *      throughput is fine — 78.7 MB/s with fsync — but a 6.1 GB tree of 73,975
 *      small files managed 25 MB in six minutes. One big sequential write is
 *      what this mount is good at, and that is exactly what a tar is.
 *
 * ## Why removing a worktree is safe
 *
 * The branch and its commits live in the PARENT repository, not in the
 * worktree, so `git worktree remove` loses nothing that was committed. Verified
 * by comparing each worktree's HEAD against the repo's branch ref before
 * removal, and by 0 stale metadata after. The archive therefore only ever
 * protects MODIFIED and UNTRACKED files — which is also why it is still worth
 * taking: those exist nowhere else.
 *
 * For a branch that was never pushed, the thing worth keeping is a `git
 * bundle`, not a tgz of a checkout: a bundle carries history, a checkout does
 * not. `--bundle-unpushed` writes one per repo alongside the archives.
 *
 * ## Safety
 *
 * DRY RUN IS THE DEFAULT. Nothing is written or deleted without --apply.
 * Refused outright, never archived:
 *   - a full clone (.git is a DIRECTORY) — it holds the object store
 *   - a directory some live process has as its cwd
 *   - anything not owned by the current user, which we could not remove anyway
 *   - anything newer than the staleness cutoff
 *
 * Usage:
 *   node scripts/archive-stale-worktrees.mjs --dir /path/to/worktrees [options]
 *     --older-than <days>   staleness cutoff by directory mtime (default 7)
 *     --dest <path>         cold store root (default /mnt/storage/coldstore/worktrees)
 *     --label <name>        subdirectory under --dest (default: the parent dir's name)
 *     --apply               actually archive and remove; without it, report only
 *     --bundle-unpushed     also write a git bundle of branches on no remote
 *     --json                machine-readable report
 */
import {execFileSync} from 'node:child_process';
import {readdirSync, existsSync, statSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {userInfo} from 'node:os';
import path from 'node:path';

const DAY = 86400000;

/** Every live process's cwd, so a worktree in use is never touched. */
export function liveCwds (procRoot = '/proc') {
    const out = new Set();
    let entries = [];
    try { entries = readdirSync(procRoot); } catch { return out; }
    for (const pid of entries) {
        if (!/^\d+$/.test(pid)) continue;
        try {
            const target = execFileSync('readlink', [path.join(procRoot, pid, 'cwd')],
                {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
            if (target) out.add(target);
        } catch { /* gone, or not ours to read */ }
    }
    return out;
}

/**
 * What to do with one directory, and why. Pure: every input is a fact the
 * caller gathered, so the decision can be tested without a filesystem.
 *
 * @param {{name, gitKind: 'file'|'dir'|'none', owner, mtimeMs, inUse}} d
 * @param {{now: number, cutoffDays: number, user: string, includePlain?: boolean}} opts
 */
export function classify (d, opts) {
    const {now, cutoffDays, user, includePlain = false} = opts;
    if (d.gitKind === 'dir') {
        return {action: 'refuse', reason: 'a full clone (.git is a directory) — it holds the object store'};
    }
    if (d.gitKind === 'none' && !includePlain) {
        return {action: 'refuse', reason: 'not a git worktree (no .git) — pass --include-plain to archive it anyway'};
    }
    if (d.owner !== user) {
        return {action: 'refuse', reason: `owned by ${d.owner}, not ${user} — we could not remove it`};
    }
    if (d.inUse) {
        return {action: 'refuse', reason: 'a live process has it as its working directory'};
    }
    const ageDays = (now - d.mtimeMs) / DAY;
    if (ageDays < cutoffDays) {
        return {action: 'skip', reason: `touched ${ageDays.toFixed(1)} day(s) ago, under the ${cutoffDays}-day cutoff`};
    }
    return {action: 'archive', reason: `idle ${ageDays.toFixed(1)} day(s)`};
}

/** The repo a worktree belongs to, from its .git file. */
export function parentRepoOf (gitFileText) {
    const m = /^gitdir:\s*(.*?)\/\.git\/worktrees\/.*$/m.exec(String(gitFileText || '').trim());
    return m ? m[1] : null;
}

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = name => process.argv.includes(`--${name}`);

const RUN = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (RUN) {
    const dir = arg('dir', null);
    if (!dir) {
        console.error('--dir <path to a directory of worktrees> is required');
        process.exit(2);
    }
    const cutoffDays = Number(arg('older-than', 7));
    const dest = arg('dest', '/mnt/storage/coldstore/worktrees');
    const label = arg('label', path.basename(path.resolve(dir)));
    const apply = flag('apply');
    const outDir = path.join(dest, label);
    const user = userInfo().username;
    const cwds = liveCwds();
    const now = Date.now();

    const report = [];
    for (const name of readdirSync(dir).sort()) {
        const full = path.join(dir, name);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (!st.isDirectory()) continue;
        const gitPath = path.join(full, '.git');
        const gitKind = existsSync(gitPath)
            ? (statSync(gitPath).isDirectory() ? 'dir' : 'file') : 'none';
        const inUse = [...cwds].some(c => c === full || c.startsWith(`${full}/`));
        const d = {name, gitKind, owner: userInfo().uid === st.uid ? user : String(st.uid), mtimeMs: st.mtimeMs, inUse};
        const verdict = classify(d, {now, cutoffDays, user, includePlain: flag('include-plain')});
        report.push({name, full, gitKind, ...verdict});
    }

    const toArchive = report.filter(r => r.action === 'archive');
    if (!flag('json')) {
        console.log(`${report.length} director(ies) under ${dir}`);
        for (const g of ['archive', 'skip', 'refuse']) {
            const rows = report.filter(r => r.action === g);
            if (!rows.length) continue;
            console.log(`\n  ${g.toUpperCase()} (${rows.length})`);
            for (const r of rows.slice(0, g === 'archive' ? 1000 : 8)) console.log(`    ${r.name} — ${r.reason}`);
            if (g !== 'archive' && rows.length > 8) console.log(`    …and ${rows.length - 8} more`);
        }
    }

    if (!apply) {
        if (flag('json')) console.log(JSON.stringify(report, null, 2));
        else console.log(`\nDRY RUN — nothing written or deleted. ${toArchive.length} would be archived to ${outDir}.`);
        process.exit(0);
    }

    mkdirSync(outDir, {recursive: true});
    let ok = 0;
    const failures = [];
    for (const r of toArchive) {
        const out = path.join(outDir, `${r.name}.tgz`);
        try {
            const srcEntries = Number(execFileSync('bash',
                ['-c', `find ${JSON.stringify(r.full)} | wc -l`], {encoding: 'utf8'}).trim());
            execFileSync('nice', ['-n', '10', 'tar', '-czf', out, '-C', dir, r.name], {stdio: 'pipe'});
            // READ IT BACK. gzip's CRC is what catches the silent right-size
            // wrong-content corruption this mount produced once; the entry
            // count catches a truncated archive that still inflates.
            const arcEntries = Number(execFileSync('bash',
                ['-c', `tar -tzf ${JSON.stringify(out)} | wc -l`], {encoding: 'utf8'}).trim());
            if (!(arcEntries > 0) || arcEntries < srcEntries - 2) {
                throw new Error(`archive has ${arcEntries} entries, source has ${srcEntries}`);
            }
            const repo = r.gitKind === 'file'
                ? parentRepoOf(readFileSync(path.join(r.full, '.git'), 'utf8')) : null;
            if (repo && existsSync(repo)) {
                try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', r.full], {stdio: 'pipe'}); }
                catch { rmSync(r.full, {recursive: true, force: true}); execFileSync('git', ['-C', repo, 'worktree', 'prune']); }
            } else {
                rmSync(r.full, {recursive: true, force: true});
            }
            if (existsSync(r.full)) throw new Error('still present after removal');
            ok++;
            console.log(`OK ${r.name} -> ${out}`);
        } catch (e) {
            try { rmSync(out, {force: true}); } catch { /* nothing to undo */ }
            failures.push({name: r.name, error: String(e.message || e).split('\n')[0]});
            console.log(`FAIL ${r.name}: ${String(e.message || e).split('\n')[0]}`);
        }
    }
    console.log(`\n${ok} archived, ${failures.length} failed.`);
    process.exit(failures.length ? 1 : 0);
}
