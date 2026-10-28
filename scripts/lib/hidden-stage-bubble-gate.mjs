import assert from 'node:assert/strict';

// Real built renderer and browser canvas/WebGL, while Robot Lab hides the stage.
export async function hiddenStageBubble(page) {
    const result = await page.evaluate(() => {
        const renderer = window.__bwSimLab._pane.props.vm.runtime.renderer;
        const id = renderer.createTextSkin('say', 'Before hiding', false);
        const skin = renderer._allSkins[id];
        try {
            const empty = skin.getTexture([0, 0]);
            const deferred = empty === null && skin._textureDirty;
            const texture = skin.getTexture([100, 100]);
            const first = Boolean(texture) && !skin._textureDirty && skin._canvas.width > 0;
            renderer.updateTextSkin(id, 'say', 'Text changed while hidden', false);
            const hidden = skin.getTexture([0, 0]) === texture && skin._textureDirty;
            const revealed = skin.getTexture([100, 100]) === texture && !skin._textureDirty;
            const flipped = skin.getTexture([-100, -100]) === texture;
            return {deferred, first, hidden, revealed, flipped};
        } finally {
            renderer.destroySkin(id);
        }
    });
    assert.deepEqual(result, {deferred: true, first: true, hidden: true, revealed: true, flipped: true});
    console.log('PASS built hidden-stage speech bubble: first render, changed text, reveal and flipped scale');
}
