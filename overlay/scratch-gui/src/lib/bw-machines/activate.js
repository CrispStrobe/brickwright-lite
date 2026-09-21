// Machine Manager — activate (design §8 step 2).
//
// One `activateConfig(config)` that maps a machine config onto the inputs the
// EXISTING boot path already takes — it does NOT rewire debug-runner. For a
// functional machine it produces the `{targetKind, machineConfig, bootMedia}`
// that `createDebugRunner({vm, …})` consumes; for a wired machine it returns a
// descriptor pointing at the circuit (design §3: wired edits/boots in the
// circuit designer, not here).
//
// Images are references fetched only on activation (design §2, §5): each boot
// slot's `{url, sha256}` is resolved through an INJECTABLE fetcher, so a test
// passes a stub and production fetches the url and verifies the sha256.
//
// Framework-free: no React, no bundler globals. `defaultImageFetcher` uses the
// host `fetch` + Web Crypto, both present in the browser and Node ≥ 18.

import {
    normalizeMachineConfig, validateMachineConfig
} from './machine-config.js';

/** Machine kind → debug-runner `targetKind`. Same grouping as debug-runner's
 *  `selectDebugTargetKind` (i8086 covers the whole 8086/286 tier; the 386 is
 *  its own kind, not yet a branch in lite's debug-runner — see the note on
 *  activateConfig). */
const TARGET_KIND = Object.freeze({
    i8086: 'i8086', i8088: 'i8086', i80186: 'i8086', i80286: 'i8086',
    i80386: 'i80386',
    z80: 'z80', zx48: 'z80', zx128: 'z80',
    eater6502: 'eater6502', gpascal: 'eater6502'
});

/** Boot slot → the debug-runner `bootMedia.profile` that selects its branch.
 *  A floppy boots the floppy-OS path; a .com/.exe the DOS bench; a ROM has no
 *  profile (it loads as a ROM image). See debug-runner's attachI8086. */
const SLOT_PROFILE = Object.freeze({
    floppy: 'floppy-os', com: 'dos', exe: 'dos', disk: 'dos'
});

const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;

/** Hex-encode a SHA-256 of the bytes using Web Crypto. */
async function sha256Hex(bytes) {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) throw new Error('Web Crypto (crypto.subtle) is unavailable; cannot verify sha256');
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    // Copy into a fresh ArrayBuffer so a Uint8Array view with a non-zero offset
    // (a subarray) hashes only its own bytes.
    const digest = await subtle.digest('SHA-256', view.slice().buffer);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The production image fetcher: fetch the url, verify the sha256, return bytes.
 * Injectable so tests never touch the network (design §5). A fetcher receives
 * the slot reference `{url, sha256, geometry}` and returns `{bytes, sha256}`.
 */
export async function defaultImageFetcher(ref) {
    if (!isStr(ref.url)) throw new Error('image reference has no url');
    const res = await globalThis.fetch(ref.url);
    if (!res.ok) throw new Error(`failed to fetch ${ref.url}: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const hash = await sha256Hex(bytes);
    if (isStr(ref.sha256) && ref.sha256.toLowerCase() !== hash) {
        throw new Error(`sha256 mismatch for ${ref.url}: expected ${ref.sha256}, got ${hash}`);
    }
    return {bytes, sha256: hash};
}

/** Resolve one slot ref through the fetcher and (if a sha was fetched AND the
 *  ref declares one) verify it — a stub fetcher that returns no sha is trusted,
 *  which is what tests want. */
async function resolveSlot(ref, fetcher) {
    const resolved = await fetcher(ref);
    if (!resolved || !(resolved.bytes instanceof Uint8Array)) {
        throw new Error(`fetcher for ${ref.url} returned no bytes`);
    }
    if (isStr(ref.sha256) && isStr(resolved.sha256) &&
        ref.sha256.toLowerCase() !== resolved.sha256.toLowerCase()) {
        throw new Error(`sha256 mismatch for ${ref.url}`);
    }
    return resolved;
}

/**
 * Turn a config into the boot path's inputs. Fetches only the images a boot
 * needs (design §2: "fetched only on activation").
 *
 * @param {object} config a machine config (any shape; normalized+validated here)
 * @param {object} [opts]
 * @param {(ref: object) => Promise<{bytes: Uint8Array, sha256?: string}>}
 *   [opts.fetcher=defaultImageFetcher] resolves a slot's `{url, sha256}` → bytes
 * @returns {Promise<object>} an activation descriptor:
 *   - wired:      `{mode:'wired', executionMode, machine, circuit}`
 *   - functional: `{mode:'functional', executionMode, machine, targetKind,
 *                   bootMedia, machineConfig, media, debugRunnerOptions, warnings}`
 *     where `debugRunnerOptions` is exactly `{targetKind, machineConfig,
 *     bootMedia}` — the subset of `createDebugRunner`'s options a config decides.
 */
export async function activateConfig(config, opts = {}) {
    const fetcher = opts.fetcher || defaultImageFetcher;
    const cfg = normalizeMachineConfig(config);
    const {ok, errors} = validateMachineConfig(cfg);
    if (!ok) {
        const err = new Error(`cannot activate an invalid config: ${errors.join('; ')}`);
        err.validationErrors = errors;
        throw err;
    }

    // Wired (or an auto config that is wired in effect): no image fetch, just a
    // descriptor pointing at the circuit for the designer board to realize.
    const isWired = cfg.executionMode === 'wired' ||
        (cfg.executionMode === 'auto' && isObj(cfg.circuit) &&
            Object.keys(cfg.slots).length === 0);
    if (isWired) {
        return {
            mode: 'wired',
            executionMode: cfg.executionMode,
            machine: cfg.machine,
            circuit: cfg.circuit
        };
    }

    // Functional: pick the boot slot (first present in bootOrder), fetch it,
    // and shape it as debug-runner's bootMedia.
    const bootSlotId = cfg.bootOrder.find(id => cfg.slots[id]) || Object.keys(cfg.slots)[0];
    if (!bootSlotId) throw new Error('functional config has no boot slot to activate');
    const bootRef = cfg.slots[bootSlotId];

    const resolved = await resolveSlot(bootRef, fetcher);
    const bootMedia = {
        slot: bootSlotId,
        bytes: resolved.bytes,
        name: cfg.title || bootSlotId,
        profile: SLOT_PROFILE[bootSlotId] || null
    };
    if (bootRef.geometry) bootMedia.geometry = {...bootRef.geometry};
    // A ROM image states its own load address via the config; carry it so the
    // reset vector reads from real bytes (debug-runner's romAt path).
    if (typeof bootRef.romAt === 'number') bootMedia.romAt = bootRef.romAt;

    // machineConfig for createDebugRunner is the wired-extractor {regions,chips}
    // — an INLINE object (the Eater 6502 case) passes straight through; a STRING
    // preset name ('PCXT8086') is bw-board's, resolved inside the boot path (the
    // floppy branch builds PCXT8086 itself), so it is not a machineConfig object
    // and is surfaced separately instead.
    let machineConfig = null;
    let machinePreset = null;
    if (isObj(cfg.machineConfig)) machineConfig = cfg.machineConfig;
    else if (isStr(cfg.machineConfig)) machinePreset = cfg.machineConfig;

    // Additional media a full boot needs beyond the primary image: the 386's
    // BIOS + VGA option ROM (bw-board marks the 386 `bios` slot required). These
    // are resolved here so the caller has every byte a boot needs; the i8086
    // boot path supplies its own XT BIOS and needs none of these.
    const media = {};
    const warnings = [];
    for (const extraSlot of ['bios', 'vga-rom']) {
        if (extraSlot !== bootSlotId && cfg.slots[extraSlot]) {
            media[extraSlot] = await resolveSlot(cfg.slots[extraSlot], fetcher);
        }
    }

    const targetKind = TARGET_KIND[cfg.machine] || cfg.machine;
    if (cfg.machine === 'i80386') {
        // Truth in the descriptor: lite's debug-runner has no i80386 branch yet
        // (§8 step 6 ships the 386 as a config once the pin bump lands the free
        // 386 core into lite). activateConfig still produces the correct inputs;
        // a caller wiring the 386 boot consumes them then.
        warnings.push('i80386 boot is not yet wired into lite\'s debug-runner ' +
            '(design §8 step 6); bootMedia/media are produced for when it is');
    }

    return {
        mode: 'functional',
        executionMode: cfg.executionMode,
        machine: cfg.machine,
        targetKind,
        bootMedia,
        machineConfig,
        machinePreset,
        quirks: cfg.quirks,
        media,
        warnings,
        // The exact subset of createDebugRunner's options this config decides.
        // A caller merges its own `{vm, onChange}` and calls createDebugRunner.
        debugRunnerOptions: {targetKind, machineConfig, bootMedia}
    };
}
