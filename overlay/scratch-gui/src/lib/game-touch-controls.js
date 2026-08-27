const ARROWS = Object.freeze({
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    action: ' '
});

const PROFILES = Object.freeze({
    g2048: {layout: 'stage', hint: 'Swipe the stage to slide the reactor.'},
    chroma_code: {layout: 'stage', hint: 'Tap the coloured gems on the stage.'},
    missile_ballet: {layout: 'stage', hint: 'Drag on the stage to steer the jet.'},
    specter_sweep: {layout: 'stage', hint: 'Aim and tap directly on the stage.'},
    cloud_court: {
        layout: 'dpad',
        hint: 'Move and jump with the touch pad.',
        keys: {up: 'w', down: 's', left: 'a', right: 'd', action: ' '}
    },
    twinwall: {
        layout: 'dual',
        hint: 'Two players: cyan pad and gold pad.',
        keys: {leftUp: 'w', leftDown: 's', rightUp: 'ArrowUp', rightDown: 'ArrowDown'}
    }
});

export const gameTouchProfileFor = gameKey => {
    if (!gameKey) return null;
    const profile = PROFILES[gameKey] || {
        layout: 'dpad',
        hint: 'Use the touch pad and Action button.',
        keys: ARROWS
    };
    return {...profile, keys: profile.keys ? {...profile.keys} : null};
};

export default gameTouchProfileFor;
