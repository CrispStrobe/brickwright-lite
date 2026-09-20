// Which bundled extension claims which file in CrispStrobe/extensions, and at
// which commit — the data behind test/bundled-extensions-match-upstream.test.mjs.
//
// WHY THIS EXISTS
// ---------------
// On 2026-09-20 an audit compared every bundle under
// overlay/scratch-vm/src/extensions/crispstrobe/ against its upstream file and
// found five carrying changes that had never gone up: `arrays` had nine extra
// blocks, `lego_poweredup` and `legoboost_universal` each carried a Scratch
// Link endpoint fix without which that connection type could never connect
// inside the app, and two carried lint directives. None of it was careless —
// every fork had a reason visible in its own comments. What was missing, every
// time, was the step that sends the change up.
//
// Those five were reclaimed and the count reached zero. This file is what stops
// it climbing again, because a count that was measured once decays: the whole
// point is that nobody noticed the first five either.
//
// WHY NOT REUSE gallery-pins.json
// -------------------------------
// It already records a sha256 of each upstream file (`repo`) beside the bytes
// GitHub Pages serves (`served`), which is nearly this. But it is generated for
// a different job — verifying what a RUNTIME URL load hands us — so its pin
// moves when Pages redeploys, and a Pages hiccup would break a gate about
// whether OUR TREE has diverged. Two questions, two records. The commit below
// is the same repository, and `npm run sync:gallery-pins` moves the other one.
//
// WHY THE MAP IS WRITTEN OUT
// --------------------------
// A bundle's directory name is its extension id (`spikeprime`); the upstream
// file is named for what it was when it was written
// (`legospike_turbowarp_transpile.js`). Deriving one from the other would mean
// guessing, and a gate that guesses its own subject is worse than no gate. The
// claim "this bundle is that file" is exactly what should be reviewable.
import {createHash} from 'node:crypto';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '../..');
export const BUNDLES = resolve(ROOT, 'overlay/scratch-vm/src/extensions/crispstrobe');

/** CrispStrobe/extensions commit these sha256s were taken at. */
export const UPSTREAM_COMMIT = '92cbcf94af01098502c13cd7695529596d378608';
export const UPSTREAM_REPO = 'CrispStrobe/extensions';

/** bundle directory name → path within the upstream repository. */
export const MAP = {
    arrays: 'extensions/CrispStrobe/arrays.js',
    csp: 'extensions/CrispStrobe/csp.js',
    circuit: 'extensions/CrispStrobe/circuit.js',
    ev3comprehensive: 'extensions/CrispStrobe/ev3_universal.js',
    ev3dev: 'extensions/CrispStrobe/ev3dev_py_transpile.js',
    ev3lms: 'extensions/CrispStrobe/ev3_lms_transpile.js',
    legoboostunified: 'extensions/CrispStrobe/legoboost_universal.js',
    legoev3direct: 'extensions/CrispStrobe/ev3_direct.js',
    legonxt: 'extensions/CrispStrobe/legonxt_transpile_universal.js',
    legopoweredup: 'extensions/CrispStrobe/lego_poweredup.js',
    planetemaths: 'extensions/CrispStrobe/planetemaths.js',
    spikeprime: 'extensions/CrispStrobe/legospike_turbowarp_transpile.js',
    stc12: 'extensions/CrispStrobe/stc12.js',
    stc12live: 'extensions/CrispStrobe/stc12live.js',
    universalgamepad: 'extensions/CrispStrobe/gamepad.js',
    wedo2unified: 'extensions/CrispStrobe/lego_wedo2_universal.js'
};

/**
 * Bundles with no upstream file, and why.
 *
 * Not a loophole: a bundle absent from BOTH this list and MAP fails the gate,
 * so a new extension has to be classified deliberately. Saying "this is ours"
 * is cheap; saying it by accident is what this prevents.
 */
export const LITE_ONLY = {
    arcade: 'Lite-native. Reads the GUI console\'s runtime state, so upstreaming it ' +
        'would mean upstreaming that contract too.',
    bitops: 'Queued for upstream (2026-09-20 audit). An sb3-creator output contract: ' +
        'the generator emits bitops_* opcodes.',
    controller: 'Being replaced by bw-board\'s ControllerExtension export, which has ' +
        'the same five opcodes plus nine more.',
    devices: 'Queued for upstream (2026-09-20 audit). An sb3-creator output contract.',
    microbitplus: 'Queued for upstream (2026-09-20 audit).',
    text2speech: 'Queued for upstream (2026-09-20 audit). Replaces the stock cloud ' +
        'extension with an on-device one.'
};

/**
 * Bundles allowed to differ from upstream, with the reason and a review date.
 *
 * EMPTY, and that is the state worth defending. An entry here is a fork that
 * has been argued for in review rather than one that arrived unannounced —
 * which is the only difference between this and the situation the audit found.
 */
export const ALLOWED_DIVERGENCE = {};

/**
 * The extension source a bundle holds, or null if it is not a bundle at all.
 *
 * The bundle is EVALUATED with a stubbed adapter rather than parsed out of the
 * text, because the wrapper comes in two encodings — a JSON string
 * (makeExt("…")) and a template literal (makeExt(`…`)) — and a reader that
 * handles only one reports the other as "not a bundle".
 *
 * That is not hypothetical. The 2026-09-20 audit classified circuit, stc12 and
 * stc12live as un-comparable Lite ports on exactly that mistake: they are
 * ordinary bundles in the template-literal form. A tool's blind spot had been
 * written down as a fact about the repository. Evaluating cannot make that
 * error, because it asks the module what it holds instead of inferring it from
 * punctuation.
 */
export const bundlePath = id => resolve(BUNDLES, id, 'index.js');

export const bundleSource = function (id) {
    const p = bundlePath(id);
    if (!existsSync(p)) return null;
    const text = readFileSync(p, 'utf8');
    if (!text.includes('makeExt(')) return null;

    let captured = null;
    const mod = {exports: {}};
    const stubRequire = request => {
        if (request === '../adapter') return source => { captured = source; return null; };
        throw new Error(`bundle ${id} required ${request}, which a bundle should not`);
    };
    try {
        // eslint-disable-next-line no-new-func
        new Function('require', 'module', 'exports', text)(stubRequire, mod, mod.exports);
    } catch (error) {
        return null;
    }
    return typeof captured === 'string' ? captured : null;
};

export const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');

/** Every bundle directory that actually ships an extension. */
export const bundleIds = function (readdirSync) {
    return readdirSync(BUNDLES, {withFileTypes: true})
        .filter(e => e.isDirectory() && existsSync(resolve(BUNDLES, e.name, 'index.js')))
        .map(e => e.name)
        .sort();
};

export const rawURL = path =>
    `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${UPSTREAM_COMMIT}/${path}`;
