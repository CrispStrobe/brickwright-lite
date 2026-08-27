const ARROWS = Object.freeze({
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    action: ' '
});

const PROFILES = Object.freeze({
    breakout: {layout: 'stage', hint: 'Drag on the stage to move the paddle.'},
    pong_2p: {
        layout: 'dual',
        hint: 'Two players: left pad and right pad.',
        keys: {leftUp: 'w', leftDown: 's', rightUp: 'ArrowUp', rightDown: 'ArrowDown'}
    },
    pong_ai: {
        layout: 'vertical',
        hint: 'Move your paddle up and down.',
        keys: {up: 'w', down: 's'}
    },
    flappy: {layout: 'action', hint: 'Tap FLAP to climb.', keys: {action: ' '}, actionLabel: 'FLAP'},
    tictactoe: {layout: 'stage', hint: 'Tap a square on the stage.'},
    tictactoe_ai: {layout: 'stage', hint: 'Tap a square on the stage.'},
    connect4: {layout: 'stage', hint: 'Tap a column on the stage.'},
    minesweeper: {
        layout: 'stage-action',
        hint: 'Tap to reveal; hold FLAG while tapping to mark.',
        keys: {action: 'f'},
        actionLabel: 'FLAG'
    },
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

export const setTouchControl = (vm, profile, heldControls, control, isDown) => {
    const key = profile?.keys?.[control];
    if (!key || heldControls.has(control) === isDown) return false;
    if (isDown) heldControls.add(control); else heldControls.delete(control);
    vm.postIOData('keyboard', {key, isDown});
    return true;
};

export const releaseTouchControls = (vm, profile, heldControls) => {
    if (!profile?.keys) return;
    heldControls.forEach(control => {
        const key = profile.keys[control];
        if (key) vm.postIOData('keyboard', {key, isDown: false});
    });
    heldControls.clear();
};

export default gameTouchProfileFor;
