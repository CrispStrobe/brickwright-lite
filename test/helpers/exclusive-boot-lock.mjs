// Cross-process exclusion for original PXT browser sessions.
// Each process creates a unique participant directory. A participant publishes
// a ticket after choosing; an unpublished participant is still choosing. The
// lowest (ticket, id) enters, following Lamport's bakery algorithm. A dead
// participant can only have its own unique directory removed: a later owner
// never reuses that path, so stale cleanup cannot remove a replacement owner.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const DEFAULT_BOOT_LOCK = path.join(os.tmpdir(), 'bw-pxt-browser-session.lock');
const delay = () => new Promise(done => setTimeout(done, 50));

function alive(pid) {
    try {process.kill(pid, 0); return true;} catch (error) {return error.code === 'EPERM';}
}

function participants(root) {
    return fs.readdirSync(root, {withFileTypes: true}).filter(entry => entry.isDirectory())
        .map(entry => entry.name).filter(name => /^\d+-[0-9a-f-]{36}$/.test(name));
}

function ticket(root, id) {
    try {
        const names = fs.readdirSync(path.join(root, id)).filter(name => /^ticket-\d+$/.test(name));
        if (!names.length) return null; // Still choosing, or left between reads.
        if (names.length !== 1) throw new Error('Invalid PXT session lock ticket');
        const value = Number(names[0].slice(7));
        if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid PXT session lock ticket');
        return value;
    } catch (error) {if (error.code === 'ENOENT') return null; throw error;}
}

function removeDead(root, id) {
    const pid = Number(id.slice(0, id.indexOf('-')));
    if (alive(pid)) return false;
    // The UUID makes this a single-use path, even if the PID is recycled.
    fs.rmSync(path.join(root, id), {recursive: true, force: true});
    return true;
}

async function acquire(lock) {
    // Keep the namespace directory: removing it while another process starts
    // would permit two independent sets of participants. It contains no data
    // after the last participant exits.
    const root = `${lock}.participants-v1`;
    fs.mkdirSync(root, {recursive: true});
    const id = `${process.pid}-${randomUUID()}`;
    const own = path.join(root, id);
    fs.mkdirSync(own);
    try {
        let max = 0;
        for (const other of participants(root)) {
            if (other === id || removeDead(root, other)) continue;
            max = Math.max(max, ticket(root, other) || 0);
        }
        if (!Number.isSafeInteger(max + 1)) throw new Error('PXT session lock ticket exhausted');
        const mine = max + 1;
        // The number in the filename makes ticket publication atomic.
        fs.writeFileSync(path.join(own, `ticket-${mine}`), '', {flag: 'wx'});
        for (;;) {
            let blocked = false;
            for (const other of participants(root)) {
                if (other === id || removeDead(root, other)) continue;
                const theirs = ticket(root, other);
                if (theirs === null || theirs < mine || (theirs === mine && other < id)) {
                    blocked = true;
                    break;
                }
            }
            if (!blocked) return () => fs.rmSync(own, {recursive: true, force: true});
            await delay();
        }
    } catch (error) {
        fs.rmSync(own, {recursive: true, force: true});
        throw error;
    }
}

export async function withExclusiveBoot(body, {lock = DEFAULT_BOOT_LOCK, log = process.env.BW_PXT_BOOT_LOG} = {}) {
    const release = await acquire(lock);
    const start = Date.now();
    try {return await body();}
    finally {
        const end = Date.now();
        try {if (log) fs.appendFileSync(log, JSON.stringify({pid: process.pid, start, end}) + '\n');}
        finally {release();}
    }
}
