#!/usr/bin/env node
/**
 * The emitted DEFAULT web build carries no peer-session code (task E11).
 *
 * Peer sessions (LAN sharing between two apps, docs/PEERS-SECURITY-REVIEW.md) are compiled in
 * only when a build sets BW_ENABLE_PEERS=1. The source gate (test/peers-gate.test.mjs) proves
 * every consumer sits behind the DefinePlugin literal; this proves the CONSEQUENCE on the bytes
 * webpack actually wrote: not one marker of the feature in any emitted file.
 *
 * Usage: node scripts/verify-no-peer-surface.mjs <build dir>
 * Exits 1 when a marker is found, and also when the directory does not look like a real
 * editor build — a scan of an empty or wrong directory finds nothing and proves nothing.
 */
import {readdirSync, readFileSync, statSync, existsSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Strings that exist only in the gated modules (each is in exactly one of them, or in a gated
// branch of a shared file). Kept literal so a reviewer can grep the tree for each.
export const PEER_MARKERS = [
    'bw-peer-request', // the native event the editor half listens to
    'peer_send', // the native commands it invokes
    'peer_enable',
    'peer_reply',
    'bw-open-peer-sessions', // the settings-menu item
    '__brickwrightPeers', // the editor half's API for the extension
    '__brickwrightCameraCapture', // the camera hook (cameracapture extension, gated branch)
    'peersessions', // the extension id: library entry, lazy loader, dialect words
    'bwpeer://' // the link scheme
];

// Something every real editor build contains, so a scan that reads the wrong bytes fails
// instead of passing: the Camera Capture extension id sits right beside the gated entry.
export const PRESENCE_MARKER = 'cameracapture';

const TEXT = /\.(?:js|mjs|cjs|html|json|map|css|txt)$/i;

const walk = dir => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
});

/**
 * Scan an emitted build directory.
 * @param {string} dir the build directory
 * @returns {{files: number, scripts: number, present: boolean, hits: string[]}} the reading
 */
export const scanForPeerSurface = dir => {
    const files = walk(dir).filter(path => TEXT.test(path));
    const hits = [];
    let present = false;
    let scripts = 0;
    for (const file of files) {
        const text = readFileSync(file, 'utf8');
        if (/\.m?js$/i.test(file)) scripts++;
        if (text.includes(PRESENCE_MARKER)) present = true;
        for (const marker of PEER_MARKERS) {
            const at = text.indexOf(marker);
            if (at !== -1) {
                const context = text.slice(Math.max(0, at - 40), at + marker.length + 40)
                    .replace(/\s+/g, ' ');
                hits.push(`${relative(dir, file)}: "${marker}" … ${context} …`);
            }
        }
    }
    return {files: files.length, scripts, present, hits};
};

/**
 * The verdict for one reading: a list of reasons, empty when the build is clean.
 * @param {{files: number, scripts: number, present: boolean, hits: string[]}} reading a scan
 * @returns {string[]} failures
 */
export const verdict = reading => {
    const failures = [];
    if (reading.scripts < 5) {
        failures.push(`only ${reading.scripts} script file(s): not an editor build, so a clean scan means nothing`);
    }
    if (!reading.present) {
        failures.push(`no file mentions "${PRESENCE_MARKER}": the scan did not read the editor bundle`);
    }
    for (const hit of reading.hits) failures.push(`peer surface in the default build: ${hit}`);
    return failures;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const dir = process.argv[2];
    if (!dir || !existsSync(dir)) {
        console.error(`verify-no-peer-surface: build directory ${JSON.stringify(dir)} does not exist`);
        process.exit(1);
    }
    const reading = scanForPeerSurface(dir);
    const failures = verdict(reading);
    console.log(`verify-no-peer-surface: ${reading.files} files (${reading.scripts} scripts) in ${dir}, ` +
        `presence marker ${reading.present ? 'found' : 'MISSING'}, ${reading.hits.length} peer marker(s)`);
    if (failures.length) {
        for (const failure of failures) console.error(`  FAIL ${failure}`);
        process.exit(1);
    }
    console.log('verify-no-peer-surface: PASS — the default build carries no peer-session code');
}
