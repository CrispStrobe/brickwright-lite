// Lazy loader for scratch-blocks — loads the ~1 MiB blockly core as a separate webpack
// chunk instead of bundling it synchronously in gui.js. Ported from TurboWarp.
import registerFieldLed8x8 from './blocks/field-led8x8';

let _ScratchBlocks = null;

const isLoaded = () => !!_ScratchBlocks;

const get = () => {
    if (!isLoaded()) {
        throw new Error('scratch-blocks is not loaded yet');
    }
    return _ScratchBlocks;
};

const load = () => {
    if (_ScratchBlocks) {
        return Promise.resolve();
    }
    return import(/* webpackChunkName: "sb" */ 'scratch-blocks')
        .then(m => {
            _ScratchBlocks = m.default || m;
            // A comment bubble positioned on a workspace without metrics (the
            // Blocks tab hidden while a project loads) dereferences null in
            // positionBubble_ and the error unmounts the whole GUI (examples
            // 05-08, 2026-08-10). Guard HERE, not in the Blocks container -
            // at container-construction time this module has not resolved and
            // Bubble does not exist yet, which is why the first guard never
            // installed. Degrades to a skipped reposition.
            // Comment bubbles crash on hidden workspaces: with no rendered
            // metrics, ScratchBubble's positioning chain (positionBubble_,
            // updatePosition_, moveTo, ...) dereferences null at whichever
            // method reads first — guarding them one by one just moves the
            // crash (observed live: it hopped to updatePosition_). Guard the
            // ENTRY POINT instead: if a comment cannot open its bubble, it
            // stays closed; the text is intact and opens fine once the
            // workspace is actually visible. (Examples 05-08, 2026-08-10.)
            if (typeof window !== 'undefined') window.__bwBubbleGuard = [];
            for (const name of ['ScratchBlockComment', 'WorkspaceComment', 'ScratchWorkspaceComment']) {
                const proto = _ScratchBlocks[name] && _ScratchBlocks[name].prototype;
                if (!proto || typeof proto.setVisible !== 'function') continue;
                if (proto.setVisible.__bwGuarded) continue;
                const orig = proto.setVisible;
                proto.setVisible = function (...args) {
                    try { return orig.apply(this, args); } catch (e) {
                        console.warn('[brickwright] comment left closed (hidden workspace):', e && e.message);
                    }
                };
                proto.setVisible.__bwGuarded = true;
                if (typeof window !== 'undefined') window.__bwBubbleGuard.push(name);
            }
            // Register the A2 8x8 brightness-matrix field + its shadow block
            // against the loaded Blockly, the same runtime-patch pattern as
            // the bubble guard above (no scratch-blocks recompile needed).
            try {
                registerFieldLed8x8(_ScratchBlocks);
            } catch (e) {
                console.warn('[brickwright] FieldLed8x8 registration skipped:', e && e.message);
            }
            return _ScratchBlocks;
        });
};

export default {
    get,
    isLoaded,
    load
};
