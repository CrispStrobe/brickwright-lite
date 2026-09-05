/**
 * RUN THE TESTS AGAINST WHAT GIT ACTUALLY HAS.
 *
 * `test/reseat-gate.test.mjs` climbs directories looking for a sibling git
 * worktree and reads three fixtures tracked in NO repository. Two people ran
 * the full suite -- uncapped, real exit codes, no pipes -- and both got green.
 * CI could never go green, and nothing in either passing run distinguished the
 * two cases. That is the failure this script exists to make impossible.
 *
 * IT DOES NOT DETECT. An earlier attempt here preloaded a module that wrapped
 * `fs` and recorded every path resolved, on the theory that a lexical scan
 * cannot see a path built at run time by a loop. It could not work, and the
 * reason is worth keeping: the test does `import { statSync } from 'node:fs'`,
 * and an ESM named import binds to the function directly, so patching the `fs`
 * object afterwards intercepts nothing. It reported "0 findings" against the
 * very file it was written to catch -- a detector that could not fail, written
 * while hunting gates that cannot fail.
 *
 * So this reproduces CI's condition instead of modelling it: `git archive
 * HEAD` into a temporary directory is EXACTLY the tracked tree and nothing
 * else, with no sibling worktrees above it and no untracked leftovers in it.
 * A test that needs either fails there and passes at home, which is the whole
 * signal.
 *
 * `node_modules` is symlinked rather than copied: dependencies are not the
 * subject, and a fresh install would take longer than the suite.
 *
 * WHAT THIS REPRODUCES IS NOT QUITE CI, AND THE GAP IS packages/ (2026-09-05).
 * CI runs `npm run vendor` and then `node scripts/integrate.mjs`, which copies
 * overlay/ into packages/. .gitignore says so in as many words: packages/ is
 * POPULATED, not tracked. 33 of the 127 files under
 * packages/scratch-gui/src/lib/bw-board -- the whole 8086 support-chip tier --
 * are correctly absent from git and correctly present after integrate.
 *
 * So a bare `git archive HEAD` MANUFACTURES A FAILURE for any test that reads
 * packages/. It reported two on the day this note was written, and both are
 * false: rp2040-bootrom.js and i8086-machine.js are tracked under overlay/ and
 * arrive in packages/ when integrate runs.
 *
 * I drew a real conclusion from one of those and it was wrong -- I called a
 * gate "green only because of untracked files, could never pass in CI" having
 * read the tar listing and not the .gitignore two lines above the answer. A
 * tool that reproduces the wrong condition is as misleading as a detector that
 * models the wrong signal, and this one was built to replace exactly that.
 *
 * --integrate runs the populate step inside the temporary tree first, so the
 * reproduction matches what CI actually does. Use it for anything touching
 * packages/; the bare form still answers the original question, which was
 * about sibling worktrees and untracked FIXTURES, where no populate step
 * exists and absence is the whole point.
 *
 * WHAT A FAILURE MEANS. Not "this test is wrong" -- a test may legitimately
 * need a large corpus checked out beside the repo. It means the dependency is
 * UNDECLARED. Commit the fixture, or make the test skip explicitly and
 * loudly when the path is absent, so an absent corpus reads as a skip and
 * never as a pass.
 *
 * Usage:
 *   node scripts/audit-clean-checkout.mjs test/reseat-gate.test.mjs [...]
 *   node scripts/audit-clean-checkout.mjs --all
 *   node scripts/audit-clean-checkout.mjs --integrate test/foo.test.mjs
 *
 * @module
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, existsSync, readdirSync, mkdirSync, statSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const argv = process.argv.slice(2);
const all = argv.includes('--all');
// Run CI's populate step inside the temporary tree. Without it, `git archive`
// alone is not CI's condition for anything under packages/ -- see the header.
const integrate = argv.includes('--integrate');
const wanted = argv.filter((a) => !a.startsWith('--'));

const files = all
    ? readdirSync(join(ROOT, 'test')).filter((f) => /\.test\.m?js$/.test(f))
        .map((f) => join('test', f))
    : wanted.map((f) => relative(ROOT, resolve(f)));

if (!files.length) {
    console.error('give test files, or --all');
    process.exit(2);
}

/** `packages/<x>/node_modules` and the like — one level of nesting is what
 *  this monorepo has, and a deeper search would spend its time in the trees
 *  it is about to symlink. */
function nestedNodeModules () {
    const out = [];
    for (const top of ['packages', 'overlay']) {
        const dir = join(ROOT, top);
        if (!existsSync(dir)) continue;
        for (const e of readdirSync(dir)) {
            const cand = join(dir, e, 'node_modules');
            try { if (statSync(cand).isDirectory()) out.push(join(top, e, 'node_modules')); }
            catch { /* none here */ }
        }
    }
    return out;
}


/**
 * Run a child in ITS OWN PROCESS GROUP and reap anything it leaves behind.
 *
 * REPORTED 2026-09-05 by lego-b9, who found ten `vite --port 31xx` processes,
 * 2.7 GB resident, 19 hours old, every one with a `/proc/<pid>/cwd` of
 * "/tmp/clean-checkout-XXXXXX (deleted)". They had outlived the tree they
 * served by most of a day and helped push the box into swap exhaustion.
 *
 * The mechanism is exactly this function's shape before the fix: `spawnSync`
 * returns when the test process exits, and a dev server the test detached
 * keeps running. The `finally` then deletes the temp directory out from under
 * it, which is why the cwd reads "(deleted)" -- the leak is invisible in the
 * place you would look for it, since the directory it belongs to is gone.
 *
 * `detached: true` puts the child at the head of a new process group, so
 * `kill(-pid)` reaches every descendant, including ones the test deliberately
 * detached from itself. ESRCH is the normal case (nothing survived) and is not
 * an error.
 */
function runReaped (cmd, args, opts) {
    const r = spawnSync(cmd, args, {...opts, detached: true});
    if (r.pid) {
        try { process.kill(-r.pid, 'SIGTERM'); }
        catch { /* ESRCH: the group is already gone, which is the good case */ }
    }
    return r;
}

/**
 * Kill anything still standing in the temp tree, by the signature lego-b9
 * actually observed: `/proc/<pid>/cwd` pointing inside it.
 *
 * THE PROCESS-GROUP KILL ABOVE IS NOT ENOUGH IN THEORY: a grandchild spawned
 * with `detached: true` -- exactly how a dev server is started -- calls setsid
 * and leads its OWN group, so `kill(-childPid)` cannot reach it. The cwd scan
 * keys on where a process IS rather than on how it was started, which is the
 * property that survives detachment.
 *
 * THIS IS REASONED, NOT MEASURED, AND I WANT THAT ON THE RECORD. I built a
 * harness to prove it and the harness was broken: the CONTROL arm -- a
 * detached grandchild with no kill at all -- also failed to survive, so all
 * three arms agreed for the same reason none of them measured anything. I only
 * caught it by running the control, which I had not done for the first two
 * attempts and which flatly contradicted them. A plain detached child of an
 * interactive shell DOES survive here, so detachment works; something about
 * the nested spawn under this session's process supervision cleans up the
 * grandchild regardless. I did not chase it further with the box in swap.
 *
 * So: kill-before-delete is strictly better than delete-first whatever the
 * outcome (deleting first is what produced the "(deleted)" cwd that made the
 * leak invisible), and the cwd scan is the right shape for the reported
 * signature. Whether it fully closes lego-b9's ten vite processes is UNVERIFIED.
 * Anyone who can reproduce a surviving dev server should check it rather than
 * trust this comment.
 *
 * Linux-only and best-effort: /proc may not exist, and a pid can vanish between
 * listing and reading, both of which are fine.
 */
function killStragglersIn (dir) {
    let procs;
    try { procs = readdirSync('/proc').filter((e) => /^\d+$/.test(e)); }
    catch { return 0; }
    let killed = 0;
    for (const pid of procs) {
        if (Number(pid) === process.pid) continue;
        let cwd;
        try { cwd = realpathSync(join('/proc', pid, 'cwd')); }
        catch { continue; }          // gone, or not ours to read
        if (cwd !== dir && !cwd.startsWith(dir + '/')) continue;
        try { process.kill(Number(pid), 'SIGTERM'); killed++; }
        catch { /* already exited */ }
    }
    if (killed) console.log(`  reaped ${killed} process(es) still living in the clean tree`);
    return killed;
}

const work = mkdtempSync(join(tmpdir(), 'clean-checkout-'));

// CLEAN UP WHEN KILLED, NOT ONLY WHEN FINISHED.
//
// The `finally` below removes the tree on a normal exit and on a throw. It
// does NOT run on a signal, and on this box these runs are killed routinely:
// `timeout` sends SIGTERM, and the suite regularly outlives its cap when the
// machine is loaded.
//
// FOUND BY MEASUREMENT, not by reading. `/tmp/clean-checkout-rhpM4t`, 236 MB,
// orphaned at 11:37 with no process inside it, while the root filesystem sat
// at 99%. One killed run costs a quarter of a gigabyte and leaves no trace of
// which invocation made it -- the same "(deleted)"-shaped invisibility that
// hid the vite leak, one layer up: there the processes outlived the tree,
// here the tree outlives the run.
//
// `process.exit()` inside the handler is deliberate: re-raising the signal
// after removing the handler would be tidier for exit codes, but this script
// is a developer tool whose exit code already means "some file failed", and a
// half-deleted temp tree is worse than an imprecise status.
const cleanup = () => { try { rmSync(work, {recursive: true, force: true}); } catch { /* gone */ } };
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => { killStragglersIn(work); cleanup(); process.exit(130); });
}
process.on('uncaughtException', (e) => { killStragglersIn(work); cleanup(); throw e; });
try {
    // EXACTLY THE TRACKED TREE. `git archive` cannot include an untracked
    // file, which is the point: if a fixture is missing here it was missing
    // from the repository all along.
    execFileSync('/bin/bash', ['-c',
        `git -C ${JSON.stringify(ROOT)} archive HEAD | tar -x -C ${JSON.stringify(work)}`],
    {stdio: 'inherit'});

    if (integrate) {
        // `scripts/integrate.mjs` copies overlay/ into packages/, which is what
        // .gitignore means by "populated by npm run vendor". Reported rather
        // than assumed: if the step fails, say so instead of running the suite
        // against a tree that is neither the tracked one nor CI's.
        const r = runReaped(process.execPath, [join(work, 'scripts/integrate.mjs')],
            {cwd: work, stdio: 'inherit'});
        if (r.status !== 0) {
            console.error(`\nintegrate.mjs exited ${r.status} in the clean tree — ` +
                'refusing to report on a tree that is neither the tracked one nor CI\'s.');
            process.exit(2);
        }
        console.log('  integrated overlays (CI does this before the suite)\n');
    }

    // EVERY node_modules, not just the root one. This is a monorepo: the
    // first version symlinked `<root>/node_modules` alone and a test importing
    // `packages/scratch-gui/src/lib/sb3-creator.js` failed with "Cannot find
    // package 'jszip'" -- which the audit then reported as a missing FIXTURE.
    // An absent dependency and an absent fixture are different faults and the
    // gate must not confuse them, or it names the victim instead of the cause,
    // which is the shape it exists to stop.
    for (const rel of ['node_modules', ...nestedNodeModules()]) {
        const src = join(ROOT, rel);
        if (!existsSync(src)) continue;
        const dst = join(work, rel);
        mkdirSync(dirname(dst), {recursive: true});
        try { symlinkSync(src, dst, 'dir'); } catch { /* already there */ }
    }

    console.log(`clean checkout at ${work}\n`);
    let failed = 0;
    for (const rel of files) {
        if (!existsSync(join(work, rel))) {
            console.log(`  FAIL ${rel}: the TEST FILE itself is not tracked`);
            failed++; continue;
        }
        const r = runReaped(process.execPath, ['--test', rel],
            {cwd: work, encoding: 'utf8', maxBuffer: 1 << 28});
        const pass = /^# fail 0$/m.test(r.stdout || '') && r.status === 0;
        if (pass) { console.log(`  ok   ${rel}`); continue; }
        failed++;
        const why = (r.stdout || '').match(/^ *(?:error|code): .*$/gm) || [];
        console.log(`  FAIL ${rel}  (exit ${r.status})`);
        for (const line of why.slice(0, 3)) console.log(`       ${line.trim()}`);
    }
    console.log(`\n${files.length} file(s) run from the tracked tree; ${failed} failed.`);
    if (failed) {
        console.error('These pass here and cannot pass from a clean checkout: they depend on '
            + 'files git does not have, or on paths outside the repository. Commit the '
            + 'fixture, or make the test SKIP loudly when it is absent — an absent fixture '
            + 'must never read as a pass.');
        process.exit(1);
    }
} finally {
    // KILL BEFORE DELETING. Deleting first is what produced the "(deleted)"
    // cwd in the report: the directory is gone, so the leak is invisible in
    // the place anyone would look for it.
    killStragglersIn(work);
    rmSync(work, {recursive: true, force: true});
}
