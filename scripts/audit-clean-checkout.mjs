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
import { mkdtempSync, rmSync, symlinkSync, existsSync, readdirSync, mkdirSync, statSync, realpathSync, readFileSync } from 'node:fs';
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

/**
 * THE CLASS THIS SCRIPT STRUCTURALLY CANNOT REPRODUCE: an absolute path.
 *
 * Everything else here works because `git archive HEAD` produces exactly the
 * tracked tree, so a RELATIVE path that escapes it fails in the temp dir the
 * same way it fails in CI. AN ABSOLUTE PATH DOES NOT. `/mnt/volume1/...`
 * resolves identically inside the clean tree and outside it, so a test
 * depending on one PASSES HERE AND FAILS IN CI -- which is the exact failure
 * this script exists to make impossible, arriving through the one door it
 * cannot close.
 *
 * Reproduction is the right technique and this is its blind spot, so the
 * blind spot gets a DETECTOR rather than a comment. Named as such: a detector
 * needs a signal and can be fooled, which is why the rest of this file is not
 * one.
 *
 * Raised by lego-a4, who hit three in bw-board -- the ehBASIC ROM, an MS-DOS
 * toolchain, and a 191 MB corpus at an absolute path no runner has -- after
 * building a CI step whose success quantified over "the assembler is present"
 * while its goal was "the comparison ran".
 *
 * ONLY PATHS THAT ARE ACTUALLY READ COUNT. lite's own `gate-shapes.test.mjs`
 * contains `/mnt/volume1/code/bw-board/src/i8086.js` as a FIXTURE STRING for
 * a detector test -- it is a needle, not a dependency, and flagging it would
 * be the same false positive that had this repo's shape auditor crying wolf
 * on nine module specifiers this morning.
 */
const SAFE_ROOTS = ['/tmp/', '/dev/', '/proc/', '/sys/', '/var/tmp/'];
function absolutePathDeps (dir, files) {
    const hits = [];
    let scanned = 0;
    for (const rel of files) {
        let src;
        try { src = readFileSync(join(dir, rel), 'utf8'); }
        catch (e) {
            // NOT `catch { continue }`. A silent skip makes "no absolute-path
            // dependencies" indistinguishable from "read nothing at all" --
            // species 13, swallowed precondition, in the detector I had just
            // written to close a different blind spot. It cost twenty minutes
            // of debugging a regex that was correct.
            console.error(`  (could not scan ${rel} for absolute paths: ${e.code || e.message})`);
            continue;
        }
        scanned++;
        for (const m of src.matchAll(/['"`](\/[A-Za-z0-9_.@-][^'"`\n]{3,})['"`]/g)) {
            const target = m[1];
            if (SAFE_ROOTS.some((r) => target.startsWith(r))) continue;
            if (target.startsWith(dir)) continue;
            // Argument to a filesystem or exec call, not a string being searched for.
            const before = src.slice(Math.max(0, m.index - 90), m.index);
            if (!/(?:readFileSync|readFile|existsSync|statSync|realpathSync|readdirSync|access|createRequire|execFileSync|execSync|spawnSync|spawn|import)\s*\(\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?$|path\.(?:join|resolve)\s*\(\s*$/.test(before)) continue;
            hits.push({file: rel, line: src.slice(0, m.index).split('\n').length, target});
        }

        // THE DOMINANT REAL SHAPE IS A CONFIG DEFAULT, not a call argument:
        //
        //     const CORPUS = process.env.I8086_CORPUS ||
        //         '/mnt/volume1/code/retro-corpus-8086/.../Source Code';
        //
        // The literal is never passed to readFileSync -- the VARIABLE is,
        // pages later. My first version required the literal to be an argument
        // and therefore missed the one real instance in this repo, and I only
        // knew because I ran it against a file I KNEW had the dependency and
        // watched it report clean. A detector that reports clean on its own
        // motivating example is not a detector.
        //
        // So: assign-then-use, the same two-step derivation the perf-hint gate
        // uses. It also keeps the fixture case out -- gate-shapes.test.mjs has
        // `const p = '/mnt/.../i8086.js';` INSIDE A STRING passed to scan(), so
        // `p` is never a variable in this file's own code and never reaches a
        // read.
        for (const m of src.matchAll(
            // `[^;]*?` NOT `[^;\n]*?`: the real instance wraps across two lines --
            // `const CORPUS = process.env.I8086_CORPUS ||\n    '/mnt/...';` -- and
            // forbidding the newline made this match nothing at all. Found by
            // running the regex against the actual file after the tool reported
            // clean on the dependency it was written to find.
            /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;]*?['"`](\/[A-Za-z0-9_.@-][^'"`\n]{3,})['"`]/g
        )) {
            const [, name, target] = m;
            if (SAFE_ROOTS.some((r) => target.startsWith(r))) continue;
            if (target.startsWith(dir)) continue;
            if (hits.some((h) => h.target === target && h.file === rel)) continue;
            const used = new RegExp(
                `(?:readFileSync|readFile|existsSync|statSync|realpathSync|readdirSync|access|` +
                `execFileSync|execSync|spawnSync|spawn)\\s*\\([^)]*\\b${name}\\b|` +
                `path\\.(?:join|resolve)\\s*\\(\\s*${name}\\b`
            );
            if (!used.test(src)) continue;
            hits.push({file: rel, line: src.slice(0, m.index).split('\n').length, target,
                via: name});
        }
    }
    // The count is returned so the caller can say what it looked at rather
    // than only what it found.
    hits.scanned = scanned;
    return hits;
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

    // REPORTED SEPARATELY FROM THE PASS/FAIL, because these did not fail here
    // and cannot: an absolute path resolves the same inside the clean tree as
    // outside it. A green run above says nothing about them, and the whole
    // point of this section is that the green does not cover them.
    const abs = absolutePathDeps(work, files);
    if (abs.length) {
        console.error(`\n${abs.length} ABSOLUTE PATH(S) THIS REPRODUCTION CANNOT TEST:`);
        for (const a of abs) console.error(`  ${a.file}:${a.line}  ${a.target}`);
        console.error('\n  These resolve identically inside the clean tree and outside it, so');
        console.error('  they PASSED ABOVE and will fail on any machine that lacks them. That');
        console.error('  is the exact failure this script exists to catch, arriving through the');
        console.error('  one door reproduction cannot close. Commit the fixture, take the path');
        console.error('  from an environment variable with a loud skip when it is unset, or');
        console.error('  accept it knowingly -- but do not read the green above as covering it.');
    } else {
        console.log(`  no absolute-path dependencies in the ${abs.scanned} file(s) scanned ` +
            '(the class this reproduction cannot cover)');
    }
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
