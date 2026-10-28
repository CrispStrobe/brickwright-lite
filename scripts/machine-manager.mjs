#!/usr/bin/env node
// Machine Manager — the headless CLI (design §2, §8).
//
// The design promises ONE schema "reused by GUI + CLI", and that "what you build
// in the dialog runs headless, and vice-versa" (§2, §8). This is the CLI half of
// that promise — and the production consumer of the lib/bw-machines/ foundation:
// the schema, store, importers and activate run HERE, not only in the Node tests.
// (The Manager UI is a later increment; a CLI is not UI.)
//
// It imports the INTEGRATED tree (packages/scratch-gui/src/lib/…), the same way
// scripts/oracle-differential.mjs imports its lib modules.
//
//   machine-manager validate        <config.json>
//   machine-manager normalize       <config.json>
//   machine-manager import-dosbox   <file.conf>
//   machine-manager import-manifest <brickwright-media.json>
//   machine-manager import-repo     <manifest.json …>   (many → a library)
//   machine-manager activate        <config.json>       (a boot plan; no fetch)
//
// Framework-free: plain Node, no React, no DOM.

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';

import {
    validateMachineConfig, normalizeMachineConfig
} from '../packages/scratch-gui/src/lib/bw-machines/machine-config.js';
import {
    createMemoryMachineStore
} from '../packages/scratch-gui/src/lib/bw-machines/machine-store.js';
import {
    fromDosboxConf, fromMediaManifest, fromManifestRepo
} from '../packages/scratch-gui/src/lib/bw-machines/importers.js';
import {
    activateConfig
} from '../packages/scratch-gui/src/lib/bw-machines/activate.js';

const USAGE = `usage: machine-manager <command> [args]

  validate        <config.json>              print {ok, errors}; exit 1 if invalid
  normalize       <config.json>              print the canonical config
  import-dosbox   <file.conf>                a dosbox.conf -> a machine config
  import-manifest <brickwright-media.json>   a media manifest -> a machine config
  import-repo     <manifest.json> [more…]    many manifests -> a library (a store)
  activate        <config.json>              a boot plan (targetKind/bootMedia; no fetch)
`;

const readJson = (io, path) => JSON.parse(io.readFile(path, 'utf8'));

/**
 * Run the CLI. Injectable I/O so a test drives it without spawning a process
 * or touching the real filesystem.
 *
 * @param {string[]} argv args after `node machine-manager.mjs`
 * @param {object} [io]
 * @param {(p: string, enc: string) => string} [io.readFile]
 * @param {(s: string) => void} [io.stdout]
 * @param {(s: string) => void} [io.stderr]
 * @returns {Promise<number>} an exit code
 */
export async function run(argv, io = {}) {
    const readFile = io.readFile || readFileSync;
    const out = io.stdout || (s => process.stdout.write(s));
    const err = io.stderr || (s => process.stderr.write(s));
    const print = obj => out(JSON.stringify(obj, null, 2) + '\n');

    const [cmd, ...rest] = argv;
    try {
        switch (cmd) {
        case 'validate': {
            if (!rest[0]) { err(USAGE); return 2; }
            const {ok, errors} = validateMachineConfig(
                normalizeMachineConfig(readJson({readFile}, rest[0])));
            print({ok, errors});
            return ok ? 0 : 1;
        }
        case 'normalize': {
            if (!rest[0]) { err(USAGE); return 2; }
            print(normalizeMachineConfig(readJson({readFile}, rest[0])));
            return 0;
        }
        case 'import-dosbox': {
            if (!rest[0]) { err(USAGE); return 2; }
            print(fromDosboxConf(readFile(rest[0], 'utf8'),
                {title: `DOSBox: ${basename(rest[0])}`}));
            return 0;
        }
        case 'import-manifest': {
            if (!rest[0]) { err(USAGE); return 2; }
            print(fromMediaManifest(readJson({readFile}, rest[0]), {source: rest[0]}));
            return 0;
        }
        case 'import-repo': {
            if (!rest.length) { err(USAGE); return 2; }
            const entries = rest.map(p => ({path: p, manifest: readJson({readFile}, p)}));
            const {configs, errors} = fromManifestRepo(entries);
            // Load the library into an in-memory store so the round-trip the GUI
            // does (import -> store -> export) is exercised on the CLI too.
            const store = createMemoryMachineStore();
            for (const cfg of configs) await store.put(cfg);
            print({imported: configs.length, errors, library: await store.export()});
            return errors.length ? 1 : 0;
        }
        case 'activate': {
            if (!rest[0]) { err(USAGE); return 2; }
            // A boot PLAN: a fetcher that resolves nothing (zero-length bytes)
            // and records which refs a real boot would fetch, so this shows the
            // mapping onto the debug runner's inputs without needing the images.
            const fetched = [];
            const planFetcher = async ref => {
                fetched.push(ref.url);
                return {bytes: new Uint8Array()};
            };
            const result = await activateConfig(
                readJson({readFile}, rest[0]), {fetcher: planFetcher});
            // Summarize bootMedia bytes (a plan does not carry the image).
            const plan = {...result};
            if (plan.bootMedia) plan.bootMedia = {...plan.bootMedia, bytes: `<${plan.bootMedia.bytes.length} bytes>`};
            if (plan.media) {
                plan.media = Object.fromEntries(Object.entries(plan.media).map(
                    ([k, v]) => [k, {...v, bytes: `<${v.bytes.length} bytes>`}]));
            }
            print({...plan, wouldFetch: fetched});
            return 0;
        }
        default:
            err(USAGE);
            return cmd ? 2 : 1;
        }
    } catch (e) {
        err(`machine-manager: ${e.message}\n`);
        return 1;
    }
}

// Run as a program, but not when imported by a test.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
    run(process.argv.slice(2)).then(code => process.exit(code));
}
