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
            return _ScratchBlocks;
        });
};

export default {
    get,
    isLoaded,
    load
};
