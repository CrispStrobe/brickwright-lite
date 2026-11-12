// Per-job watchdog. A program that wedges the VM in a synchronous loop (or a
// browser that never answers) cannot be interrupted from inside its own
// process, so each job runs in a child process that this module can kill.
//
// Only processes this module spawned are ever signalled: the child and its
// descendants, found by walking parent pids from the child's own pid. Playwright
// starts Chromium detached from the child's process group, so a group kill would
// leak it; the tree walk reaps it.
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTER = path.resolve(HERE, '../register-gui-scope.mjs');
const CHILD = path.join(HERE, 'child.mjs');

/** Descendant pids of `root` (not including it), deepest first. */
export function descendants(root) {
    const listing = spawnSync('ps', ['-axo', 'pid=,ppid='], {encoding: 'utf8'});
    const table = listing.stdout || '';
    const kids = new Map();
    for (const line of table.split('\n')) {
        const [pid, ppid] = line.trim().split(/\s+/).map(Number);
        if (!pid || pid === listing.pid) continue; // the ps that is listing, a child of ours, is not a leftover
        if (!kids.has(ppid)) kids.set(ppid, []);
        kids.get(ppid).push(pid);
    }
    const out = [];
    const walk = pid => { for (const kid of kids.get(pid) || []) { walk(kid); out.push(kid); } };
    walk(root);
    return out;
}

export function killTree(pid) {
    const doomed = [...descendants(pid), pid];
    for (const target of doomed) { try { process.kill(target, 'SIGKILL'); } catch { /* already gone */ } }
    return doomed;
}

/**
 * Run `child.mjs` with a JSON job. Resolves {status:'done'|'timeout'|'crashed', lines, killed, stderr}.
 * `lines` are the JSON lines the child appended to the job's `out` file before it ended, so a
 * timeout keeps every result produced up to that point.
 */
export function runJob(job, {timeoutMs, workDir, childScript = CHILD}) {
    fs.mkdirSync(workDir, {recursive: true});
    const id = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const jobPath = path.join(workDir, `job-${id}.json`), out = path.join(workDir, `out-${id}.jsonl`);
    fs.writeFileSync(jobPath, JSON.stringify({...job, out})); fs.writeFileSync(out, '');
    return new Promise(resolve => {
        const child = spawn(process.execPath, ['--no-warnings', '--import', REGISTER, childScript, jobPath], {stdio: ['ignore', 'ignore', 'pipe'], env: {...process.env, BW_GUI_SCOPE_LOG: ''}});
        let stderr = '', settled = false, timedOut = false, killed = [];
        child.stderr.on('data', d => { if (stderr.length < 4000) stderr += d; });
        const finish = status => {
            if (settled) return; settled = true; clearTimeout(timer);
            // The child may leave Chromium behind on a crash; reap whatever is still ours.
            const leftovers = descendants(child.pid);
            for (const pid of leftovers) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
            const lines = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
            for (const f of [jobPath, out]) fs.rmSync(f, {force: true});
            resolve({status, lines, killed, stderr: stderr.trim().slice(-1000)});
        };
        const timer = setTimeout(() => { timedOut = true; killed = killTree(child.pid); }, timeoutMs);
        child.on('close', code => finish(timedOut ? 'timeout' : code === 0 ? 'done' : 'crashed'));
        child.on('error', () => finish('crashed'));
    });
}
