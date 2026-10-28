// The registering door: obtaining SB3Creator without this app's artwork must be
// impossible, not merely discouraged.
//
// WHY THIS FILE EXISTS. The `SHAPE art <name>` verb is upstream in sb3-creator; the
// 246 sprites are lite's own product content, so `SB3Creator._vectorArt` starts EMPTY
// and a host injects its own (sb3-creator docs/LITE-REVENDOR-VECTOR-ART.md). The two
// tests that already touch the artwork BOTH pass with the app broken:
//
//   pseudocode-game-examples.test.mjs calls `SB3Creator.registerVectorArt(vectorArt)`
//     itself at module scope, so it proves the COMPILER can hold the art — never that
//     the running app hands it over.
//   game-touch-controls.test.mjs imports sb3-creator-vector-art.js directly and would
//     keep passing even if registration were forgotten everywhere.
//
// It WAS forgotten: registration lived in pseudocode-importer.jsx alone while
// circuit-tab.jsx and lib/bw-debug/debug-runner.js each constructed their own
// SB3Creator against an empty registry. A game example opened from the Circuit tab, or
// a game program reaching the debug runner without the importer having mounted, parsed
// `SHAPE art …` as `Unknown SHAPE "art"` and silently lost its costumes.
//
// Two tests, and the second is the one that survives a refactor: the first proves the
// door registers, the third proves nobody can walk past it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Deliberately NOT importing sb3-creator.js — this file must never register anything
// itself, or it becomes the third false green.
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import games from '../overlay/scratch-gui/src/lib/sb3-creator-game-examples.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('importing the door registers this app\'s artwork, with no help from the caller', () => {
    const names = SB3Creator.vectorArtNames();
    // 246 measured 2026-08-29 by sb3-creator's own verification run and re-measured
    // here. A floor rather than an equality so authoring a new sprite is not a test
    // edit, but a floor high enough that ZERO — the shape of a forgotten
    // registration — can never pass.
    assert.ok(names.length >= 246,
        `registry holds ${names.length} entries; the door did not inject the artwork`);
});

test('a game example parsed through the door keeps its authored SVG BYTES', () => {
    // The same byte-level check pseudocode-game-examples.test.mjs makes, but reached
    // the way the app reaches it: nothing in this file called registerVectorArt.
    const creator = new SB3Creator();
    creator.parse(games.sky_skim);
    assert.deepEqual(creator.warnings, [],
        'parse warned — an empty registry reports `Unknown SHAPE "art"` here');
    const svgs = [...creator.assets.values()].filter(a => a.type === 'svg').map(a => a.data);
    assert.ok(svgs.length > 0, 'sky_skim produced no SVG assets — art did not reach parse()');
    assert.ok(svgs.some(s => s.includes('SKYLINE SWOOP')),
        'sky_skim lost its authored SVG text; the registry was empty at parse time');
    assert.ok(svgs.some(s => s.includes('12 CLEAN LAUNCHES WIN')),
        'sky_skim lost its authored onboarding text');
});

test('no app module reaches the compiler except through the registering door', () => {
    // Mutation control: point any of the three call sites back at sb3-creator.js and
    // this goes red naming the file. That is the whole point — the property is
    // "unreachable unregistered", and only a source scan can hold it.
    const DOOR = 'sb3-creator-register-art.js';
    // The door itself, and the two test-only importers named in the header, are the
    // complete allow-list. It is a list of FILES, not a pattern, so a new bypass has
    // to be added here by hand and argued for in review.
    const ALLOWED = new Set([
        'overlay/scratch-gui/src/lib/sb3-creator-register-art.js'
    ]);
    const offenders = [];
    const walk = dir => {
        for (const entry of readdirSync(dir)) {
            if (entry === 'node_modules' || entry === '.git') continue;
            const full = path.join(dir, entry);
            if (statSync(full).isDirectory()) {
                walk(full);
                continue;
            }
            if (!/\.(js|jsx|mjs)$/.test(entry)) continue;
            const rel = path.relative(root, full);
            if (ALLOWED.has(rel)) continue;
            const src = readFileSync(full, 'utf8');
            // Match the specifier only — `'…/sb3-creator.js'` — so the door's own
            // name, and every sb3-creator-*.js sibling, are untouched.
            if (/['"][^'"]*\/sb3-creator\.js['"]/.test(src)) offenders.push(rel);
        }
    };
    walk(path.join(root, 'overlay'));
    assert.deepStrictEqual(offenders, [],
        `${offenders.length} app module(s) import sb3-creator.js directly instead of ` +
        `lib/${DOOR}; each one constructs a compiler with an EMPTY vector-art registry ` +
        `and parses game programs as Unknown SHAPE "art".`);
});
