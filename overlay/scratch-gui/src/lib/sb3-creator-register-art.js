// The registering door to the transpiler.
//
// The `SHAPE art <name>` / `COSTUME <n> art <a>` / `BACKDROP <n> art <a>` VERB is
// upstream in sb3-creator (fdb1334) with round-trip and refusal tests. The ARTWORK
// is deliberately not: 246 hand-drawn sprites are this app's product decision, not a
// transpiler feature, so `SB3Creator._vectorArt` starts EMPTY and a host injects its
// own. See sb3-creator docs/LITE-REVENDOR-VECTOR-ART.md.
//
// WHY THIS MODULE RE-EXPORTS THE CLASS INSTEAD OF BEING A BARE SIDE EFFECT.
// Registration is global and idempotent, so a plain `import './…-register-art.js'`
// beside each `import './sb3-creator.js'` would work — but only for as long as every
// future call site remembers to write both lines. It failed exactly that way once
// already: the art was registered in pseudocode-importer.jsx alone, while
// circuit-tab.jsx and bw-debug/debug-runner.js constructed their own SB3Creator with
// an empty registry, so a game program reaching the debug runner without the importer
// having mounted parsed with `Unknown SHAPE "art"` and lost its costumes. Making this
// the only module that hands out the class turns "remember to register" into
// "you cannot obtain the class unregistered", which is a property rather than a habit.
// test/vector-art-registration.test.mjs holds that property.
//
// Both imports are static and this module carries the webpackChunkName "sb3-creator"
// at all three call sites, so the compiler is emitted ONCE (importing it from a second
// async chunk would have duplicated 886 kB) and the 149 kB of art rides in that same
// lazily-loaded chunk. Nothing here is in the initial bundle.
import SB3Creator from './sb3-creator.js';
import art from './sb3-creator-vector-art.js';

// Returns the entry count; ignored here, asserted by the tests (246 as of 2026-08-30).
SB3Creator.registerVectorArt(art);

export default SB3Creator;
