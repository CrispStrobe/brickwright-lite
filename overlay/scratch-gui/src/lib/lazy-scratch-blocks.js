// Lazy loader for scratch-blocks — loads the ~1 MiB blockly core as a separate webpack
// chunk instead of bundling it synchronously in gui.js. Ported from TurboWarp.
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
            // ScratchBubble OVERRIDES positionBubble_ on its own prototype,
            // so guarding only the base class intercepts nothing — both get
            // the wrap, and any future subclass with its own copy would too.
            for (const name of ['Bubble', 'ScratchBubble']) {
                const proto = _ScratchBlocks[name] && _ScratchBlocks[name].prototype;
                if (!proto || typeof proto.positionBubble_ !== 'function') continue;
                if (!Object.prototype.hasOwnProperty.call(proto, 'positionBubble_')) continue;
                if (proto.positionBubble_.__bwGuarded) continue;
                const orig = proto.positionBubble_;
                proto.positionBubble_ = function (...args) {
                    try { return orig.apply(this, args); } catch (e) {
                        console.warn('[brickwright] comment bubble reposition skipped:', e && e.message);
                    }
                };
                proto.positionBubble_.__bwGuarded = true;
            }
            return _ScratchBlocks;
        });
};

export default {
    get,
    isLoaded,
    load
};
