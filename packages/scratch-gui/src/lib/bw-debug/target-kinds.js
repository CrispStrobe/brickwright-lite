import {makeT} from '../bw-i18n.js';

/**
 * Engine kinds the app can SELECT but bw-board's own `getTargetKinds()` does
 * not LIST, and why that gap is filled here rather than there.
 *
 * The debugger's engine picker is deliberately built from bw-board's list:
 * that module owns which targets exist and what each is called, and a list
 * duplicated in the app is a list that drifts. But the panel does not only
 * render that list — it also SELECTS into it, from `DEVICE_TO_KIND` and
 * `CORE_TO_KIND`, and those two sets have to agree. When they do not, the
 * `<select>` holds a value none of its options carries: the browser shows
 * the FIRST option instead, so a panel running an 8086 image reads
 * "Simulated (STC12 / 8051)". Plausible and wrong, which is the shape this
 * codebase keeps paying for, and worse than an absent entry because it
 * actively misinforms.
 *
 * `i8086` is exactly that case today. `debug-target-factory.js` accepts the
 * kind (`createDebugTarget('i8086')` builds the machine and the debug
 * target) and its `getTargetKinds()` does not mention it — the factory grew
 * the target and the menu did not. That file is VENDORED: `overlay/.../
 * bw-board/` is overwritten wholesale by `npm run sync:bwboard`, so an edit
 * there is lost work by design.
 *
 * REPORTED, not patched upstream from here: bw-board's `getTargetKinds()`
 * should carry an `i8086` entry, at which point `mergeTargetKinds` finds it
 * already present and adds nothing. The merge is by kind and is idempotent
 * precisely so that the fix upstream needs no change here.
 *
 * @module
 */

/**
 * @typedef {{kind: string, label: string, description: string}} TargetKind
 */

/** @type {TargetKind[]} */
/**
 * The one entry this app adds to bw-board's list, in the reader's language.
 *
 * `Simulated (8086)` and its description render in the debug panel's target
 * picker, so they are translated; `8086`, `XT BIOS`, `.COM`/`.EXE` and `ASM`
 * are names of things and stay as they are in every language.
 */
const L10N = Object.freeze({
    en: Object.freeze({
        i8086Label: 'Simulated (8086)',
        i8086Description: 'Intel 8086/8088 — a drawn board or the XT BIOS, and a DOS bench for '
            + 'the .COM/.EXE the ASM tab assembles.'
    }),
    de: Object.freeze({
        i8086Label: 'Simuliert (8086)',
        i8086Description: 'Intel 8086/8088 — eine gezeichnete Platine oder das XT-BIOS, dazu eine '
            + 'DOS-Werkbank für die .COM/.EXE, die der ASM-Tab assembliert.'
    })
});

const t = makeT(L10N);

/** @param {string} [locale] the reader's locale; absent falls back to English. */
export const extraTargetKinds = locale => [
    {
        kind: 'i8086',
        label: t(locale, 'i8086Label'),
        description: t(locale, 'i8086Description')
    }
];

/** @deprecated kept for callers that have no locale; English. */
export const EXTRA_TARGET_KINDS = extraTargetKinds();

/**
 * bw-board's list plus anything the app can select and it does not name.
 *
 * Merged by kind, so an upstream that grows the entry wins and nothing is
 * ever listed twice. Returns a NEW array: the caller pushes the labwired
 * entry onto its result, and mutating a module-level constant would make the
 * heavy tier appear twice on the second mount.
 */
export function mergeTargetKinds (kinds, locale) {
    const out = [...(kinds || [])];
    for (const extra of extraTargetKinds(locale)) {
        if (!out.some(k => k.kind === extra.kind)) out.push(extra);
    }
    return out;
}

export default mergeTargetKinds;
