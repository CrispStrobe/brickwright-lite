// Host the complete retained MIT single-background scroller on the native Arcade scene.
// Selecting this factory does not call any of the original module's lazy initializers.
module.exports = function createLegacyScrollerHost(ext, imageEngine, initializeOriginal) {
    const wrap = raw => raw ? {raw,
        get width() {return raw.width;}, get height() {return raw.height;}} : null;
    return initializeOriginal({
        game: {
            currentScene: () => ({
                eventContext: {get deltaTime() {return ext._state().frameDeltaTime || 0;}},
                camera: ext._camera()
            }),
            // The original uses game.onUpdate (priority 20), before camera update 55.
            // Its callback belongs in the real scene's ordered update list, not in
            // _frameHandlersOf: that list's handlers >=19 run after the camera.
            onUpdate: handler => {if (handler) ext._updateHandlers.push({host: handler});},
            addScenePushHandler: handler => {if (handler) ext._scenePushHandlers.push({host: handler});},
            addScenePopHandler: handler => {if (handler) ext._scenePopHandlers.push({host: handler});}
        },
        scene: {
            backgroundImage: () => {
                const state = ext._state();
                // Original PXT always supplies a blank screen-sized image until set.
                if (!state.backgroundImage) {
                    state.backgroundImage = {width: 160, height: 120, pixels: new Uint8Array(160 * 120)};
                }
                return wrap(state.backgroundImage);
            },
            createRenderable: (z, draw) => {
                const state = ext._state();
                const renderable = {z, id: state.nextSpriteId++, draw: screen => draw({
                    drawTransparentImage: (image, x, y) => {
                        if (image?.raw) imageEngine.blit(screen, image.raw, 'drawTransparentImage', x, y);
                    }
                }, ext._camera())};
                ext._renderablesOf(state).push(renderable);
                return renderable;
            }
        }
    });
};
