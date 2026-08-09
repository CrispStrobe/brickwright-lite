/**
 * "Pause here" — the debugger's one piece of input in the block editor.
 *
 * `debugger-ui.md` §3: a breakpoint is a right-click on a block, because that
 * is how every editor does it and because the alternative (a list of task and
 * state numbers) is not something a Scratch user can act on.
 *
 * Two decisions are visible here.
 *
 * **The menu item appears only for hardware projects.** The block editor is
 * shared with ordinary Scratch projects, where "Pause here" would be an item
 * that can never do anything. The gate is the same one the Circuit tab uses:
 * the project declares pins.
 *
 * **It is offered on every block, not only on yield points.** The user cannot
 * see which blocks the program can actually stop at — a `wait` and a `turn on`
 * look equally stoppable — so refusing the click on one and accepting it on its
 * neighbour reads as a broken editor. Every block can be marked; the runner
 * resolves the ones this build has a yield point for and reports the rest as
 * unreachable, which the panel shows. That is the "snap forward and say so"
 * rule from §3, with the saying-so done by the panel rather than by a dialog.
 *
 * @module
 */

import {
    isBreakpoint, toggleBreakpoint, subscribeBreakpoints, conditionOf,
    listBreakpoints
} from './breakpoints.js';
import { valuesAtBlock } from './hover-values.js';
import { showConditionEditor } from './condition-editor.js';

const MARKED_CLASS = 'bw-breakpoint';

const TEXT = {
    en: {
        set: '⏸ Pause here', clear: '⏸ Don’t pause here',
        when: '⏸ Pause here when…',
        lastHere: 'last here', ago: 'ago', hereNow: 'here now',
        noVars: 'no variables in this project',
        prompt: 'Pause here only when this is true.\n\nFor example:  counter > 10\n' +
            'Comparisons only (> < >= <= = !=), joined with and / or.'
    },
    de: {
        set: '⏸ Hier anhalten', clear: '⏸ Hier nicht anhalten',
        when: '⏸ Hier anhalten, wenn…',
        lastHere: 'zuletzt hier vor', ago: '', hereNow: 'jetzt hier',
        noVars: 'keine Variablen in diesem Projekt',
        prompt: 'Nur anhalten, wenn das zutrifft.\n\nZum Beispiel:  counter > 10\n' +
            'Nur Vergleiche (> < >= <= = !=), verknüpft mit and / or.'
    }
};

/**
 * The marker. Blockly owns the block's SVG, so this only adds a class and lets
 * CSS do the rest — anything that reaches into the generated shapes would be
 * undone by the next re-render.
 */
const CSS = `
.${MARKED_CLASS} > .blocklyPath {
    stroke: #e74c3c;
    stroke-width: 2px;
}
.bw-bp-dot {
    pointer-events: none;
}
.bw-hover-values {
    position: fixed;
    z-index: 1000;
    pointer-events: none;
    background: #12121f;
    border: 1px solid #2c3e50;
    border-radius: 6px;
    padding: 6px 9px;
    font: 12px/1.45 monospace;
    color: #ecf0f1;
    box-shadow: 0 4px 14px rgba(0,0,0,.45);
    max-width: 280px;
}
.bw-hover-values .bw-when { color: #7f8c8d; font-size: 11px; }
.bw-hover-values .bw-name { color: #bdc3c7; }
.bw-hover-values .bw-val  { color: #f39c12; }
`;

let installed = false;

/**
 * Install the context-menu item and the marker.
 *
 * @param {object} ScratchBlocks the injected scratch-blocks namespace
 * @param {object} vm the scratch-vm instance, for the hardware-project gate
 * @param {() => string} getLocale
 * @returns {() => void} uninstall
 */
export function installBreakpointMenu(ScratchBlocks, vm, getLocale = () => 'en', onCondition = null) {
    const inert = { repaint() {}, uninstall() {} };
    if (installed || !ScratchBlocks || !ScratchBlocks.BlockSvg) return inert;
    installed = true;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    /**
     * Does this project have hardware to debug?
     *
     * This gate was `vm.runtime.stc.pins.length` alone, and that made the whole
     * feature unreachable in the commonest flow. bw-blocks found it by driving
     * a real browser rather than reading the code: write pseudocode, press
     * "To blocks", right-click a `turn on led1` — and the menu shows only
     * Duplicate / Add Comment / Delete. `runtime.stc` is populated by a full
     * project load, not by the importer, so a freshly converted project has
     * pins on screen, the STC12 palette visible, and no gate.
     *
     * The consequence was larger than a missing menu item: everything
     * downstream is gated behind it, so **0 of 6 breakpoint-decoration cases
     * could be tested** — the decoration never renders if the mark can never
     * be set.
     *
     * So ask the question three ways, cheapest first, and pass if any says yes.
     * All three are things the user can already see:
     *
     *   1. `runtime.stc` — set after a load. The fast path, unchanged.
     *   2. the stc12 extension being loaded — which is exactly why the palette
     *      shows an STC12 category. If the blocks are offerable, the project is
     *      a hardware project.
     *   3. the Stage comment the serializer now carries declarations in
     *      (sb3-creator e7d739d), for a project loaded from a file. The marker
     *      is `_stcconfig_` (SB3Creator.STC_MAGIC) under comment id
     *      `stcconfig` — checked against the source rather than guessed, having
     *      first written `@bw-stc` here, which matches nothing.
     *
     * None of these serialises the project; a right-click must stay cheap.
     */
    const isHardwareProject = () => {
        const runtime = vm && vm.runtime;
        if (!runtime) return false;

        const stc = runtime.stc;
        if (stc && stc.pins && stc.pins.length) return true;

        const em = vm.extensionManager;
        if (em && typeof em.isExtensionLoaded === 'function') {
            try {
                if (em.isExtensionLoaded('stc12') || em.isExtensionLoaded('stc12live')) return true;
            } catch { /* an extension manager mid-load is not an error here */ }
        }

        try {
            const stage = runtime.getTargetForStage && runtime.getTargetForStage();
            const comments = stage && stage.comments;
            if (comments) {
                if (comments.stcconfig) return true;
                for (const id of Object.keys(comments)) {
                    const text = comments[id] && comments[id].text;
                    if (text && text.indexOf('_stcconfig_') !== -1) return true;
                }
            }
        } catch { /* no stage yet */ }

        return false;
    };

    // Hook generateContextMenu, NOT customContextMenu.
    //
    // Defining customContextMenu on the prototype looks equivalent and breaks
    // Blockly: its Block.mixin() refuses a mixin whose members already exist,
    // and the check is `this[key] !== undefined`, which inherited prototype
    // properties satisfy. So a prototype-level customContextMenu makes every
    // block type that legitimately defines one — procedure calls do — throw
    // "Mixin will overwrite block members" at load. That error was live on the
    // deployed editor; one of the two menus was being clobbered and which one
    // depended on load order.
    //
    // generateContextMenu is the supported override point: Blockly calls it to
    // build the option list and then calls customContextMenu on top, so
    // appending here lands in the same place and collides with nothing.
    const previous = ScratchBlocks.BlockSvg.prototype.generateContextMenu;
    ScratchBlocks.BlockSvg.prototype.generateContextMenu = function () {
        const options = previous ? previous.call(this) : [];
        this.bwAddDebugMenu(options);
        return options;
    };
    ScratchBlocks.BlockSvg.prototype.bwAddDebugMenu = function (options) {
        if (!isHardwareProject()) return;
        const words = TEXT[getLocale()] || TEXT.en;
        const marked = isBreakpoint(this.id);
        options.push({
            enabled: true,
            text: marked ? words.clear : words.set,
            callback: () => {
                toggleBreakpoint(this.id);
                paint(this.workspace);
            }
        });
        // The conditional form is a SEPARATE item rather than a mode, so the
        // plain one stays a single click. A condition already set is offered
        // back for editing instead of making the user retype it.
        options.push({
            enabled: true,
            text: words.when,
            callback: () => {
                const existing = conditionOf(this.id) || '';
                let varNames = [];
                if (vm && vm.runtime && vm.runtime._bwDebugVariables) {
                    varNames = vm.runtime._bwDebugVariables().map((v) => v.name);
                } else if (vm) {
                    const stage = vm.runtime && vm.runtime.getTargetForStage && vm.runtime.getTargetForStage();
                    if (stage && stage.variables) {
                        varNames = Object.values(stage.variables).map((v) => v.name);
                    }
                }
                const svg = this.getSvgRoot && this.getSvgRoot();
                const box = svg ? svg.getBoundingClientRect() : { right: 200, top: 200 };
                showConditionEditor({
                    x: box.right + 8,
                    y: box.top,
                    variables: varNames,
                    existing,
                    locale: getLocale(),
                    onDone: (source) => {
                        if (source === null) return;
                        if (onCondition) onCondition(this.id, source.trim());
                        paint(this.workspace);
                    }
                });
            }
        });
    };

    // ─── hover: what was `counter` HERE? ─────────────────────────────────
    //
    // The question a learner actually has, and the one a live-values pane
    // cannot answer — by the time you look, the program has moved on. Every
    // recorded stop carries a full variable snapshot and the position it was
    // taken at, so hovering a block can show what was true the last time the
    // program was there.
    //
    // It says WHEN, always. A value with no timestamp beside it reads as
    // current, and the whole point is that it is not.

    let tip = null;
    /** Blocks that already have listeners, so repainting does not stack them. */
    const wired = new WeakSet();

    function hideTip() {
        if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
        tip = null;
    }

    function showTip(block, at) {
        hideTip();
        const words = TEXT[getLocale()] || TEXT.en;
        tip = document.createElement('div');
        tip.className = 'bw-hover-values';
        const when = at.agoMs < 1
            ? words.hereNow
            : `${words.lastHere} ${at.agoMs < 1000
                ? `${at.agoMs.toFixed(0)} ms` : `${(at.agoMs / 1000).toFixed(1)} s`} ${words.ago}`;
        const rows = at.variables.length
            ? at.variables.map((v) =>
                `<div><span class="bw-name">${escapeHtml(v.name)}</span> ` +
                `<span class="bw-val">${v.value}</span></div>`).join('')
            : `<div class="bw-when">${words.noVars}</div>`;
        tip.innerHTML = `<div class="bw-when">${when}</div>${rows}`;
        document.body.appendChild(tip);

        const svg = block.getSvgRoot();
        const box = svg.getBoundingClientRect();
        tip.style.left = `${Math.min(box.right + 8, window.innerWidth - tip.offsetWidth - 8)}px`;
        tip.style.top = `${Math.max(8, box.top)}px`;
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"]/g, (ch) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    }

    /**
     * Put the marker + red dot on every marked block, and wire hover.
     *
     * Called on every Blockly workspace change event (addChangeListener in
     * blocks.jsx), so the dot survives drag, undo/redo, collapse/expand and
     * workspace reload. The dot is in the block's local SVG coordinate space,
     * so it scales correctly with zoom.
     *
     * The dot is re-created (not moved) on every paint, because Blockly may
     * replace a block's SVG root element entirely. querySelector finds any
     * existing dot and skips re-creation; if the SVG was rebuilt, the old dot
     * is gone and a new one is appended.
     */
    function paint(workspace) {
        if (!workspace || !workspace.getAllBlocks) return;
        // Prune marks on blocks that no longer exist (deleted, or project
        // switched without clearing). A stale mark is harmless for the dot
        // but the runner would still try to resolve it.
        const allIds = new Set(workspace.getAllBlocks().map((b) => b.id));
        for (const id of listBreakpoints()) {
            if (!allIds.has(id)) toggleBreakpoint(id);
        }
        for (const block of workspace.getAllBlocks()) {
            const svg = block.getSvgRoot && block.getSvgRoot();
            if (!svg || !svg.classList) continue;
            const isBp = isBreakpoint(block.id);
            svg.classList.toggle(MARKED_CLASS, isBp);

            // Red dot: an SVG circle at the left edge of the block.
            // Re-created on every paint because Blockly rebuilds the SVG.
            let dot = svg.querySelector('.bw-bp-dot');
            if (isBp && !dot) {
                dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                dot.setAttribute('class', 'bw-bp-dot');
                dot.setAttribute('cx', '6');
                dot.setAttribute('cy', '14');
                dot.setAttribute('r', '5');
                dot.setAttribute('fill', '#e74c3c');
                dot.setAttribute('stroke', '#c0392b');
                dot.setAttribute('stroke-width', '1');
                svg.appendChild(dot);
            } else if (!isBp && dot) {
                dot.remove();
            }

            if (wired.has(svg)) continue;
            wired.add(svg);
            svg.addEventListener('mouseenter', () => {
                const at = valuesAtBlock(block.id);
                // No recording at this block is a real answer, and a tooltip
                // saying nothing would be worse than none at all.
                if (at) showTip(block, at);
            });
            svg.addEventListener('mouseleave', hideTip);
        }
    }

    // Re-paint whenever the set changes or the workspace redraws. Blockly
    // rebuilds SVG on load, drag and undo, and a class set once would quietly
    // disappear on any of them.
    let workspaceRef = null;
    const unsubscribe = subscribeBreakpoints(() => paint(workspaceRef));

    const repaint = (workspace) => { workspaceRef = workspace; paint(workspace); };

    return {
        repaint,
        uninstall() {
            hideTip();
            unsubscribe();
            ScratchBlocks.BlockSvg.prototype.generateContextMenu = previous;
            delete ScratchBlocks.BlockSvg.prototype.bwAddDebugMenu;
            if (style.parentNode) style.parentNode.removeChild(style);
            installed = false;
        }
    };
}
