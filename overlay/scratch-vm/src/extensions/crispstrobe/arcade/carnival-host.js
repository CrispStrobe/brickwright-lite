// SPDX-License-Identifier: MPL-2.0
const initialize = require('./carnival-pxt');
const {createProgramSettings} = require('./program-settings');

module.exports = function createCarnivalHost (ext) {
    const epoch = ext._terrainEpoch;
    const waits = new Set();
    let cancelled = false;
    const aborted = () => Object.assign(new Error('Carnival program stopped'), {code: 'CARNIVAL_CANCELLED'});
    const guard = () => { if (cancelled || epoch !== ext._terrainEpoch) throw aborted(); };
    const wait = operation => {
        guard();
        let cancel;
        const stopped = new Promise((_, reject) => { cancel = () => reject(aborted()); waits.add(cancel); });
        return Promise.race([Promise.resolve().then(() => { guard(); return operation(); }), stopped]).then(value => { guard(); return value; })
            .finally(() => waits.delete(cancel));
    };
    const ignoreCancelled = operation => {
        try {const result=operation();return result?.catch?result.catch(error=>{if(error.code!=='CARNIVAL_CANCELLED')throw error;}):result;}
        catch(error){if(error.code!=='CARNIVAL_CANCELLED')throw error;}
    };
    const storage = createProgramSettings(ext._runtime.getTargetForStage(), {
        ...(Object.prototype.hasOwnProperty.call(ext._runtime, 'bwArcadeSettingsStorage') ?
            {storage: ext._runtime.bwArcadeSettingsStorage} : {}),
        changed: () => ext._runtime.emitProjectChanged?.()
    });
    ext._highScore=storage.readNumber('high-score');
    const {game} = ext._gameOverModule();
    const {image, img, wrap} = ext._dialogHost;
    const music = ext._music();
    const melodySound = melody => ({melody, play: () => wait(() => music.run(melody.play()))});
    const effectNames = ['confetti', 'hearts', 'smiles', 'blizzard', 'bubbles', 'starField', 'clouds', 'none',
        'dissolve', 'melt', 'slash', 'splatter'];
    const effects = Object.fromEntries(effectNames.map(name => [name, {startScreenEffect: () => {
        guard();
        if (['dissolve', 'melt', 'slash', 'splatter'].includes(name)) ext._particles().effects[name].startScreenEffect();
        else ext.startScreenEffect({EFFECT: name, DURATION: 0});
    }}]));
    const info = {
        score: () => { guard(); return ext.getPlayerScore({PLAYER: 1}); },
        highScore: () => { guard(); return storage.readNumber('high-score') || 0; },
        setScore: value => { guard(); ext.setPlayerScore({PLAYER: 1, VALUE: value}); },
        saveHighScore: () => {
            guard();
            const candidates = (ext._infoState().players || []).map(player => player?.score).filter(score => score !== undefined);
            let score = null;
            for(const candidate of candidates)if(ext._isBetterScore(candidate,score))score=candidate;
            const previous = storage.readNumber('high-score');
            // The original uses the current game-over scoring configuration.
            if (score!==null && ext._isBetterScore(score, previous == null ? null : previous)) {storage.writeNumber('high-score', score);ext._highScore=score;}
        },
        onCountdownEnd: handler => { guard(); ext._infoState(); ext._countdownHandlers = [{host: () => ignoreCancelled(() => wait(handler))}]; },
        startCountdown: seconds => { guard(); ext.startCountdown({N: seconds}); }
    };
    for (let n = 1; n <= 4; n++) info['player' + n] = {getState: () => { guard(); return ext._lifeState(n); }};
    const host = {
        game: {BaseDialog: game.BaseDialog,
            currentScene: () => { guard(); const state = ext._state(); return {millis: () => state.elapsedMs || 0}; },
            popScene: () => wait(() => ext.popScene({})), pushScene: () => wait(() => ext.pushScene({})),
            over: (win, effect) => wait(() => {
                const name = effectNames.find(name => effects[name] === effect);
                return ext.legacyGameOver({WIN: win, EFFECT: name || 'unset'});
            }),
            waitAnyButton: () => wait(() => ext._nextButtonPress()),
            setGameOverSound: (win, sound) => {
                guard();
                ext._gameOverState().config.setSound(win, music.pxt.music.melodyPlayable(sound.melody), false, true);
            }},
        info, effects, settings: {readNumber: name => { guard(); return storage.readNumber(name); },
            writeNumber: (name, value) => { guard(); storage.writeNumber(name, value); }},
        control: {timer1: {millis: () => { guard(); return ext._globalElapsedMs; }},
            reset: () => { guard(); ext._runtime.stopAll(); ext._runtime.greenFlag(); }},
        scene: {HUD_Z: 100,
            setBackgroundImage: value => { guard(); ext._state().backgroundImage = value.raw; ext._renderBackgroundImage(); },
            createRenderable: (z, draw) => {
                guard(); const state = ext._state();
                ext._renderablesOf(state).push({z, id: state.nextSpriteId++, draw: screen => draw(wrap(screen))});
            }},
        music: {powerUp: melodySound(music.pxt.music.powerUp)},
        screen: {width: 160, height: 120, isMono: false,
            clone: () => { guard(); const raw = ext._screenRaw();
                return wrap({width: raw.width, height: raw.height, pixels: raw.pixels.slice()}); }},
        image, img, pause: ms => wait(() => ext._arcadePause(ms))
    };
    const {carnival} = initialize(host);
    const effect = name => {
        if (name === 'unset') return undefined;
        if (!Object.prototype.hasOwnProperty.call(effects, name)) throw new Error('Unknown carnival effect ' + name);
        return effects[name];
    };
    const style = name => {
        if (!Object.prototype.hasOwnProperty.call(carnival.WinTypes, name) || typeof carnival.WinTypes[name] !== 'number') {
            throw new Error('Unknown carnival win style ' + name);
        }
        return carnival.WinTypes[name];
    };
    return {
        countdown: args => { guard(); carnival.startCountdownGame(Number(args.SECONDS), style(String(args.STYLE)), effect(String(args.EFFECT))); },
        gameOver: args => { guard(); return carnival.onGameOverExpanded(style(String(args.STYLE)), effect(String(args.EFFECT))); },
        customGameOver: args => {
            guard();
            let sound;
            if (args.HAS_SOUND) {
                const melody = ext._musicValue(args.SOUND, 'Melody');
                // _musicValue already reports BLOCKS_ERROR. Stop this call
                // without throwing out of the synchronous VM primitive.
                if (!melody) return;
                sound = melodySound(melody);
            }
            let scoring;
            if (args.SCORING !== 'unset') {
                scoring = carnival.ScoreTypes[args.SCORING];
                if (typeof scoring !== 'number') throw new Error('Unknown carnival scoring type ' + args.SCORING);
            }
            return carnival.customGameOverExpanded(args.MESSAGE, effect(String(args.EFFECT)), sound,
                scoring, args.HAS_SCORE ? args.SCORE : undefined);
        },
        cancel: () => { cancelled = true; for (const cancel of waits) cancel(); waits.clear(); },
        storage
    };
};
