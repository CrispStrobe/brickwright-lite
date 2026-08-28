const ARROWS = Object.freeze({
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    action: ' '
});

const PROFILES = Object.freeze({
    g2048: {layout: 'stage', hint: 'Swipe the reactor to slide every tile.'},
    sigil_grid: {layout: 'stage', hint: 'Tap SOLO or DUO, then tap an empty sigil cell.'},
    vector_seven: {layout: 'stage', hint: 'Drag the gold paddle; tap the court to serve.'},
    reactor_ricochet: {layout: 'stage', hint: 'Drag the paddle; tap to launch and catch cyan power cells.'},
    flux_vault: {
        layout: 'dpad', hint: 'Push every cyan core onto a gold dock. Reset if a core is trapped.',
        keys: {...ARROWS}, actionLabel: 'RESET'
    },
    neon_circuit: {layout: 'stage', hint: 'Tap nodes to flip a cross; make all 25 nodes dark.'},
    canal_command: {layout: 'stage', hint: 'Tap the three lock controls in a safe water-level sequence.'},
    sky_skim: {
        layout: 'vertical',
        hint: 'Hold Dive into a hill; release to launch. Flap only when needed.',
        keys: {up: 'ArrowUp', down: 'ArrowDown'},
        upLabel: 'FLAP',
        downLabel: 'DIVE'
    },
    chroma_code: {layout: 'stage', hint: 'Tap four gems on the stage to make a guess.'},
    fusion_foundry: {
        layout: 'horizontal', hint: 'Choose a shaft, then drop the NEXT core.',
        keys: {left: 'ArrowLeft', right: 'ArrowRight', action: ' '}, actionLabel: 'DROP'
    },
    missile_ballet: {layout: 'stage', hint: 'Drag on the stage to steer the jet.'},
    orbit_ward: {
        layout: 'horizontal', hint: 'Rotate the cyan shield around the orbit.',
        keys: {left: 'ArrowLeft', right: 'ArrowRight'}
    },
    rooftop_relay: {
        layout: 'vertical',
        hint: 'Jump red vents. Hold Slide under orange drones.',
        keys: {up: 'ArrowUp', down: 'ArrowDown'},
        upLabel: 'JUMP',
        downLabel: 'SLIDE'
    },
    twinwall: {
        layout: 'dual',
        hint: 'Two players: cyan pad and gold pad.',
        keys: {leftUp: 'w', leftDown: 's', rightUp: 'ArrowUp', rightDown: 'ArrowDown'}
    },
    turbo_chicane: {
        layout: 'dpad', hint: 'Steer, then hold Boost through a clear gate.',
        keys: {up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight'}, upLabel: 'BOOST'
    },
    abyss_rescue: {
        layout: 'action', hint: 'Hold Rise; release to dive with the current.',
        keys: {action: ' '}, actionLabel: 'RISE'
    },
    specter_sweep: {layout: 'stage', hint: 'Aim and tap directly on the stage to cast.'},
    moonlight_heist: {
        layout: 'dpad', hint: 'Sneak to cheese, then return to the blue hideout.',
        keys: {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'}
    },
    cloud_court: {
        layout: 'dpad', hint: 'Move, jump, and press Spike while airborne.',
        keys: {up: 'w', down: 's', left: 'a', right: 'd'}, upLabel: 'JUMP', downLabel: 'SPIKE'
    },
    ember_dojo: {
        layout: 'horizontal', hint: 'Line up, then parry just before an ember arrives.',
        keys: {left: 'ArrowLeft', right: 'ArrowRight', action: ' '}, actionLabel: 'PARRY'
    },
    lockstep_lagoon: {
        layout: 'dpad', hint: 'Change lanes and spend charge to boost.',
        keys: {up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight'}, upLabel: 'BOOST'
    },
    rink_riot: {
        layout: 'dpad', hint: 'Skate into the puck, then shoot toward goal.',
        keys: {...ARROWS}, actionLabel: 'SHOOT'
    },
    rim_reactor: {
        layout: 'horizontal', hint: 'Hold Charge, release to launch, then steer in flight.',
        keys: {left: 'ArrowLeft', right: 'ArrowRight', action: ' '}, actionLabel: 'CHARGE'
    },
    comet_cup: {
        layout: 'dpad', hint: 'Run into the ball, then shoot and curve it.',
        keys: {...ARROWS}, actionLabel: 'SHOOT'
    },
    trench_signal: {
        layout: 'dpad', hint: 'Steer for cyan pearls; sonar shoves the hunter mine.',
        keys: {...ARROWS}, actionLabel: 'SONAR'
    },
    whisker_switch: {
        layout: 'dpad', hint: 'Carry cheese to the lit hole; dash out of danger.',
        keys: {...ARROWS}, actionLabel: 'DASH'
    },
    spiral_circuit: {
        layout: 'horizontal', hint: 'Change lanes; phase through danger while charged.',
        keys: {left: 'ArrowLeft', right: 'ArrowRight', action: ' '}, actionLabel: 'PHASE'
    },
    lilyway_rescue: {
        layout: 'dpad', hint: 'Hop one square at a time to the moon bank.',
        keys: {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'}
    },
    rotor_rogue: {
        layout: 'dpad', hint: 'Accelerate and counter-steer; jump over barriers.',
        keys: {...ARROWS}, actionLabel: 'JUMP', upLabel: 'GAS', downLabel: 'BRAKE'
    },
    prism_spire: {
        layout: 'action', hint: 'Drop the moving floor when it overlaps the tower.',
        keys: {action: ' '}, actionLabel: 'DROP'
    },
    shard_sheriff: {
        layout: 'horizontal', hint: 'Dodge shards and fire a vertical lance.',
        keys: {left: 'ArrowLeft', right: 'ArrowRight', action: ' '}, actionLabel: 'FIRE'
    },
    halo_foundry: {
        layout: 'horizontal', hint: 'Rotate the shield to rebound the core inward.',
        keys: {left: 'ArrowLeft', right: 'ArrowRight'}
    },
    corridor_kestrel: {
        layout: 'dpad', hint: 'Drift through each gap; shield only when needed.',
        keys: {...ARROWS}, actionLabel: 'SHIELD'
    },
    thunder_volley: {
        layout: 'dpad', hint: 'Move and jump; spike when the ball is in reach.',
        keys: {up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', action: ' '},
        upLabel: 'JUMP', actionLabel: 'SPIKE'
    },
    cascade_pair: {
        layout: 'dpad', hint: 'Choose a column, swap the pair, then lock it.',
        keys: {up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', action: ' '},
        upLabel: 'SWAP', actionLabel: 'LOCK'
    },
    mooncoil_odyssey: {
        layout: 'dpad', hint: 'Steer around your trail; dash costs oxygen.',
        keys: {...ARROWS}, actionLabel: 'DASH'
    },
    cinder_thrust: {
        layout: 'dpad', hint: 'Hold Thrust and steer through the ember rings.',
        keys: {up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight'}, upLabel: 'THRUST'
    },

    // Archived mechanics still receive sensible controls when opened from a saved project.
    breakout: {layout: 'stage', hint: 'Drag on the stage to move the paddle.'},
    pong_2p: {
        layout: 'dual', hint: 'Two players: left pad and right pad.',
        keys: {leftUp: 'w', leftDown: 's', rightUp: 'ArrowUp', rightDown: 'ArrowDown'}
    },
    pong_ai: {layout: 'vertical', hint: 'Move your paddle up and down.', keys: {up: 'w', down: 's'}},
    flappy: {layout: 'action', hint: 'Tap FLAP to climb.', keys: {action: ' '}, actionLabel: 'FLAP'},
    tictactoe: {layout: 'stage', hint: 'Tap a square on the stage.'},
    tictactoe_ai: {layout: 'stage', hint: 'Tap a square on the stage.'},
    connect4: {layout: 'stage', hint: 'Tap a column on the stage.'},
    minesweeper: {
        layout: 'stage-action', hint: 'Tap to reveal; hold FLAG while tapping to mark.',
        keys: {action: 'f'}, actionLabel: 'FLAG'
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
