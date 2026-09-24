import {makeT} from './bw-i18n.js';

/**
 * The one line of help under each game's touch controls, in the reader's
 * language.
 *
 * These were English literals inside PROFILES, where the i18n guard could not
 * see them: it matched JSX attributes under components/, and this is an object
 * field in lib/ (#306 widened it, and listed these 46 as the population to
 * shrink). A German-speaking player got German menus and English instructions.
 *
 * BUTTON NAMES STAY AS PRINTED. A hint says "Halte DIVE gedrückt" because the
 * button on screen says DIVE — translating the prose and the button label out
 * of step would be worse than leaving both in English. The labels live in
 * PROFILES and are deliberately not in this table.
 */
const HINTS = Object.freeze({
    en: Object.freeze({
        g2048: "Swipe the reactor to slide every tile.",
        sigil_grid: "Tap SOLO or DUO, then tap an empty sigil cell.",
        vector_seven: "Drag the gold paddle; tap the court to serve.",
        reactor_ricochet: "Drag the paddle; tap to launch and catch cyan power cells.",
        flux_vault: "Push every cyan core onto a gold dock. Reset if a core is trapped.",
        neon_circuit: "Tap nodes to flip a cross; make all 25 nodes dark.",
        canal_command: "Tap the three lock controls in a safe water-level sequence.",
        sky_skim: "Hold Dive into a hill; release to launch. Flap only when needed.",
        chroma_code: "Tap four gems on the stage to make a guess.",
        fusion_foundry: "Choose a shaft, then drop the NEXT core.",
        missile_ballet: "Drag on the stage to steer the jet.",
        orbit_ward: "Rotate the cyan shield around the orbit.",
        rooftop_relay: "Jump red vents. Hold Slide under orange drones.",
        twinwall: "Two players: cyan pad and gold pad.",
        turbo_chicane: "Steer, then hold Boost through a clear gate.",
        abyss_rescue: "Hold Rise; release to dive with the current.",
        specter_sweep: "Aim and tap directly on the stage to cast.",
        moonlight_heist: "Sneak to cheese, then return to the blue hideout.",
        cloud_court: "Move, jump, and press Spike while airborne.",
        ember_dojo: "Line up, then parry just before an ember arrives.",
        lockstep_lagoon: "Change lanes and spend charge to boost.",
        rink_riot: "Skate into the puck, then shoot toward goal.",
        rim_reactor: "Hold Charge, release to launch, then steer in flight.",
        comet_cup: "Run into the ball, then shoot and curve it.",
        trench_signal: "Steer for cyan pearls; sonar shoves the hunter mine.",
        whisker_switch: "Carry cheese to the lit hole; dash out of danger.",
        spiral_circuit: "Change lanes; phase through danger while charged.",
        lilyway_rescue: "Hop one square at a time to the moon bank.",
        rotor_rogue: "Accelerate and counter-steer; jump over barriers.",
        prism_spire: "Drop the moving floor when it overlaps the tower.",
        shard_sheriff: "Dodge shards and fire a vertical lance.",
        halo_foundry: "Rotate the shield to rebound the core inward.",
        corridor_kestrel: "Drift through each gap; shield only when needed.",
        thunder_volley: "Move and jump; spike when the ball is in reach.",
        cascade_pair: "Choose a column, swap the pair, then lock it.",
        mooncoil_odyssey: "Steer around your trail; dash costs oxygen.",
        cinder_thrust: "Hold Thrust and steer through the ember rings.",
        breakout: "Drag on the stage to move the paddle.",
        pong_2p: "Two players: left pad and right pad.",
        pong_ai: "Move your paddle up and down.",
        flappy: "Tap FLAP to climb.",
        tictactoe: "Tap a square on the stage.",
        tictactoe_ai: "Tap a square on the stage.",
        connect4: "Tap a column on the stage.",
        minesweeper: "Tap to reveal; hold FLAG while tapping to mark.",
        default: "Use the touch pad and Action button.",
    }),
    de: Object.freeze({
        g2048: "Wische über den Reaktor, um alle Kacheln zu verschieben.",
        sigil_grid: "Tippe SOLO oder DUO an, dann ein leeres Sigill-Feld.",
        vector_seven: "Zieh das goldene Paddel; tippe aufs Feld, um aufzuschlagen.",
        reactor_ricochet: "Zieh das Paddel; tippe zum Abschuss und fang die cyanfarbenen Energiezellen.",
        flux_vault: "Schiebe jeden cyanfarbenen Kern auf ein goldenes Dock. Setz zurück, wenn ein Kern feststeckt.",
        neon_circuit: "Tippe Knoten an, um ein Kreuz umzuschalten; mach alle 25 Knoten dunkel.",
        canal_command: "Tippe die drei Schleusensteuerungen in einer sicheren Reihenfolge der Wasserstände an.",
        sky_skim: "Halte DIVE in einen Hügel hinein, lass los zum Abheben. Nutze FLAP nur, wenn nötig.",
        chroma_code: "Tippe vier Edelsteine auf der Bühne an, um zu raten.",
        fusion_foundry: "Wähle einen Schacht und lass dann den NÄCHSTEN Kern fallen.",
        missile_ballet: "Zieh auf der Bühne, um den Jet zu lenken.",
        orbit_ward: "Dreh den cyanfarbenen Schild um die Umlaufbahn.",
        rooftop_relay: "Spring über rote Lüftungen. Halte SLIDE, um unter orangefarbenen Drohnen durchzurutschen.",
        twinwall: "Zwei Spielende: cyanfarbenes Pad und goldenes Pad.",
        turbo_chicane: "Lenke und halte dann BOOST durch ein freies Tor.",
        abyss_rescue: "Halte RISE; lass los, um mit der Strömung zu tauchen.",
        specter_sweep: "Ziele und tippe direkt auf der Bühne, um zu zaubern.",
        moonlight_heist: "Schleich dich zum Käse und kehr dann zum blauen Versteck zurück.",
        cloud_court: "Beweg dich, spring und drück SPIKE, solange du in der Luft bist.",
        ember_dojo: "Richte dich aus und pariere kurz bevor eine Glut ankommt.",
        lockstep_lagoon: "Wechsle die Spur und setze Ladung ein, um zu beschleunigen.",
        rink_riot: "Fahr in den Puck hinein und schieß dann aufs Tor.",
        rim_reactor: "Halte CHARGE, lass zum Abschuss los und lenke dann im Flug.",
        comet_cup: "Lauf in den Ball hinein, schieß und gib ihm Effet.",
        trench_signal: "Steuere auf cyanfarbene Perlen zu; SONAR stößt die Jägermine weg.",
        whisker_switch: "Trag den Käse zum erleuchteten Loch; sprinte aus der Gefahr heraus.",
        spiral_circuit: "Wechsle die Spur; durchquere Gefahren, solange du geladen bist.",
        lilyway_rescue: "Hüpf Feld für Feld bis zur Mondbank.",
        rotor_rogue: "Beschleunige und gegenlenke; spring über Hindernisse.",
        prism_spire: "Lass den fahrenden Boden fallen, wenn er über dem Turm steht.",
        shard_sheriff: "Weich den Splittern aus und feuer eine senkrechte Lanze ab.",
        halo_foundry: "Dreh den Schild, um den Kern nach innen zurückprallen zu lassen.",
        corridor_kestrel: "Gleite durch jede Lücke; nutze SHIELD nur, wenn nötig.",
        thunder_volley: "Beweg dich und spring; schmettere, wenn der Ball in Reichweite ist.",
        cascade_pair: "Wähle eine Spalte, tausch das Paar und sperre es dann.",
        mooncoil_odyssey: "Lenke um deine eigene Spur herum; DASH kostet Sauerstoff.",
        cinder_thrust: "Halte THRUST und steuere durch die Glutringe.",
        breakout: "Zieh auf der Bühne, um das Paddel zu bewegen.",
        pong_2p: "Zwei Spielende: linkes Pad und rechtes Pad.",
        pong_ai: "Beweg dein Paddel auf und ab.",
        flappy: "Tippe FLAP an, um zu steigen.",
        tictactoe: "Tippe ein Feld auf der Bühne an.",
        tictactoe_ai: "Tippe ein Feld auf der Bühne an.",
        connect4: "Tippe eine Spalte auf der Bühne an.",
        minesweeper: "Tippe zum Aufdecken; halte FLAG beim Tippen, um zu markieren.",
        default: "Nutze das Touchpad und die Aktionstaste.",
    })
});

const hintFor = makeT(HINTS);

const ARROWS = Object.freeze({
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    action: ' '
});

const PROFILES = Object.freeze({
    g2048: {layout: 'stage'},
    sigil_grid: {layout: 'stage'},
    vector_seven: {layout: 'stage'},
    reactor_ricochet: {layout: 'stage'},
    flux_vault: {
        layout: 'dpad',
        keys: {...ARROWS}, actionLabel: 'RESET'
    },
    neon_circuit: {layout: 'stage'},
    canal_command: {layout: 'stage'},
    sky_skim: {
        layout: 'vertical',
        keys: {up: 'ArrowUp', down: 'ArrowDown'},
        upLabel: 'FLAP',
        downLabel: 'DIVE'
    },
    chroma_code: {layout: 'stage'},
    fusion_foundry: {
        layout: 'horizontal',
        keys: {left: 'ArrowLeft', right: 'ArrowRight', action: ' '}, actionLabel: 'DROP'
    },
    missile_ballet: {layout: 'stage'},
    orbit_ward: {
        layout: 'horizontal',
        keys: {left: 'ArrowLeft', right: 'ArrowRight'}
    },
    rooftop_relay: {
        layout: 'vertical',
        keys: {up: 'ArrowUp', down: 'ArrowDown'},
        upLabel: 'JUMP',
        downLabel: 'SLIDE'
    },
    twinwall: {
        layout: 'dual',
        keys: {leftUp: 'w', leftDown: 's', rightUp: 'ArrowUp', rightDown: 'ArrowDown'}
    },
    turbo_chicane: {
        layout: 'dpad',
        keys: {up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight'}, upLabel: 'BOOST'
    },
    abyss_rescue: {
        layout: 'action',
        keys: {action: ' '}, actionLabel: 'RISE'
    },
    specter_sweep: {layout: 'stage'},
    moonlight_heist: {
        layout: 'dpad',
        keys: {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'}
    },
    cloud_court: {
        layout: 'dpad',
        keys: {up: 'w', down: 's', left: 'a', right: 'd'}, upLabel: 'JUMP', downLabel: 'SPIKE'
    },
    ember_dojo: {
        layout: 'horizontal',
        keys: {left: 'ArrowLeft', right: 'ArrowRight', action: ' '}, actionLabel: 'PARRY'
    },
    lockstep_lagoon: {
        layout: 'dpad',
        keys: {up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight'}, upLabel: 'BOOST'
    },
    rink_riot: {
        layout: 'dpad',
        keys: {...ARROWS}, actionLabel: 'SHOOT'
    },
    rim_reactor: {
        layout: 'horizontal',
        keys: {left: 'ArrowLeft', right: 'ArrowRight', action: ' '}, actionLabel: 'CHARGE'
    },
    comet_cup: {
        layout: 'dpad',
        keys: {...ARROWS}, actionLabel: 'SHOOT'
    },
    trench_signal: {
        layout: 'dpad',
        keys: {...ARROWS}, actionLabel: 'SONAR'
    },
    whisker_switch: {
        layout: 'dpad',
        keys: {...ARROWS}, actionLabel: 'DASH'
    },
    spiral_circuit: {
        layout: 'horizontal',
        keys: {left: 'ArrowLeft', right: 'ArrowRight', action: ' '}, actionLabel: 'PHASE'
    },
    lilyway_rescue: {
        layout: 'dpad',
        keys: {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'}
    },
    rotor_rogue: {
        layout: 'dpad',
        keys: {...ARROWS}, actionLabel: 'JUMP', upLabel: 'GAS', downLabel: 'BRAKE'
    },
    prism_spire: {
        layout: 'action',
        keys: {action: ' '}, actionLabel: 'DROP'
    },
    shard_sheriff: {
        layout: 'horizontal',
        keys: {left: 'ArrowLeft', right: 'ArrowRight', action: ' '}, actionLabel: 'FIRE'
    },
    halo_foundry: {
        layout: 'horizontal',
        keys: {left: 'ArrowLeft', right: 'ArrowRight'}
    },
    corridor_kestrel: {
        layout: 'dpad',
        keys: {...ARROWS}, actionLabel: 'SHIELD'
    },
    thunder_volley: {
        layout: 'dpad',
        keys: {up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', action: ' '},
        upLabel: 'JUMP', actionLabel: 'SPIKE'
    },
    cascade_pair: {
        layout: 'dpad',
        keys: {up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', action: ' '},
        upLabel: 'SWAP', actionLabel: 'LOCK'
    },
    mooncoil_odyssey: {
        layout: 'dpad',
        keys: {...ARROWS}, actionLabel: 'DASH'
    },
    cinder_thrust: {
        layout: 'dpad',
        keys: {up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight'}, upLabel: 'THRUST'
    },

    // Archived mechanics still receive sensible controls when opened from a saved project.
    breakout: {layout: 'stage'},
    pong_2p: {
        layout: 'dual',
        keys: {leftUp: 'w', leftDown: 's', rightUp: 'ArrowUp', rightDown: 'ArrowDown'}
    },
    pong_ai: {layout: 'vertical', keys: {up: 'w', down: 's'}},
    flappy: {layout: 'action', keys: {action: ' '}, actionLabel: 'FLAP'},
    tictactoe: {layout: 'stage'},
    tictactoe_ai: {layout: 'stage'},
    connect4: {layout: 'stage'},
    minesweeper: {
        layout: 'stage-action',
        keys: {action: 'f'}, actionLabel: 'FLAG'
    }
});

/**
 * @param {string} gameKey
 * @param {string} [locale] the reader's locale. The pane that renders this has
 *   no locale prop — bw-i18n.js documents it as one of those — so its caller
 *   passes browserLocale(); an absent locale falls back to English rather than
 *   rendering an empty hint.
 */
export const gameTouchProfileFor = (gameKey, locale) => {
    if (!gameKey) return null;
    const profile = PROFILES[gameKey] || {layout: 'dpad', keys: ARROWS};
    return {
        ...profile,
        hint: hintFor(locale, PROFILES[gameKey] ? gameKey : 'default'),
        keys: profile.keys ? {...profile.keys} : null
    };
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
