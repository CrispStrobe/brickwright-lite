// Cross-process exclusive section for original-simulator browser sessions.
// node --test runs several files at once; each original PXT oracle launches its
// own Chromium and boots the full simulator, so concurrent sessions in one
// shard compete for CPU and a fixed readiness guard then measures contention
// instead of program behaviour. Holding this section removes the contention;
// no guard, timeout or assertion changes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_BOOT_LOCK = path.join(os.tmpdir(), 'bw-pxt-browser-session.lock');
// A holder that died between creating the directory and recording its PID
// leaves an ownerless lock; it is stale once older than this.
const OWNERLESS_STALE_MS = 10000;

function alive(pid) {
    try {process.kill(pid, 0); return true;} catch (error) {return error.code === 'EPERM';}
}

function owner(lock) {
    try {return Number(fs.readFileSync(path.join(lock, 'owner'), 'utf8'));} catch {return NaN;}
}

function stale(lock) {
    const pid = owner(lock);
    if (Number.isInteger(pid) && pid > 0) return !alive(pid);
    try {return Date.now() - fs.statSync(lock).mtimeMs > OWNERLESS_STALE_MS;} catch {return false;}
}

async function acquire(lock) {
    for (;;) {
        try {
            fs.mkdirSync(lock);
            fs.writeFileSync(path.join(lock, 'owner'), String(process.pid));
            return;
        } catch (error) {if (error.code !== 'EEXIST') throw error;}
        if (stale(lock)) {
            // Rename first so only one waiter removes a given stale directory.
            const moved = `${lock}.stale-${process.pid}-${Date.now()}`;
            try {fs.renameSync(lock, moved); fs.rmSync(moved, {recursive: true, force: true});} catch {}
            continue;
        }
        await new Promise(done => setTimeout(done, 50));
    }
}

export async function withExclusiveBoot(body, {lock = DEFAULT_BOOT_LOCK, log = process.env.BW_PXT_BOOT_LOG} = {}) {
    await acquire(lock);
    const start = Date.now();
    try {return await body();}
    finally {
        const end = Date.now();
        if (log) fs.appendFileSync(log, JSON.stringify({pid: process.pid, start, end}) + '\n');
        if (owner(lock) === process.pid) fs.rmSync(lock, {recursive: true, force: true});
    }
}
