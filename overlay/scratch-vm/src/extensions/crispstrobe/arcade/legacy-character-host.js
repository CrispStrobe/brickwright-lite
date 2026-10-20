// Execute the complete MIT v0.0.2 source on native sprite/image/scene state.
// See legacy-character-source/LICENSE and PROVENANCE.md.
module.exports = function createLegacyCharacterHost(ext, initializeOriginal) {
    const wrappers = new WeakMap();
    const module = initializeOriginal({
        game: {
            currentScene: () => {
                const state = ext._state();
                return {eventContext: {
                    registerFrameHandler: (order, handler) => {
                        const list = ext._frameHandlersOf(state);
                        let i = list.length;
                        while (i > 0 && list[i - 1].order > order) i--;
                        list.splice(i, 0, {order, handler});
                    },
                    get deltaTimeMillis() {return Math.round((state.frameDeltaTime || 0) * 1000);}
                }};
            },
            addScenePushHandler: handler => {if (handler) ext._scenePushHandlers.push({host: handler});},
            addScenePopHandler: handler => {if (handler) ext._scenePopHandlers.push({host: handler});}
        },
        scene: {ANIMATION_UPDATE_PRIORITY: 15},
        sprites: {Flag: {Destroyed: 2}},
        CollisionDirection: {Left: 0, Top: 1, Right: 2, Bottom: 3}
    });
    // A single wrapper per sprite preserves the original strict identity checks.
    module.sprite = sprite => {
        if (!sprite) return null;
        let wrapper = wrappers.get(sprite);
        if (wrapper) return wrapper;
        wrapper = {
            get x() {return ext.spriteProperty({ID: sprite.id, PROPERTY: 'x'});},
            get y() {return ext.spriteProperty({ID: sprite.id, PROPERTY: 'y'});},
            get vx() {return ext.spriteProperty({ID: sprite.id, PROPERTY: 'vx'});},
            get vy() {return ext.spriteProperty({ID: sprite.id, PROPERTY: 'vy'});},
            get flags() {return sprite._destroyed ? 2 : 0;},
            isHittingTile: direction => ext.isHittingTile({ID: sprite.id, DIRECTION: direction}),
            setImage: value => {
                const image = ext._image(value);
                if (image && sprite.image !== image) {
                    ext.setSpriteImage({ID: sprite.id, IMAGE: ext._imageHandle(image)});
                }
            }
        };
        wrappers.set(sprite, wrapper);
        return wrapper;
    };
    return module;
};
