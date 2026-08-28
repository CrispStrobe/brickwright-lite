/**
 * The Arduboy console pane: a 128x64 OLED, six buttons, and a real
 * ATmega32U4 underneath.
 *
 * Unlike the micro:bit pane there is no iframe and no separate simulator
 * document — the CPU is `lib/bw-arduboy`, running in this page, so the
 * frame is drawn straight from the SSD1306's GDDRAM into a canvas.
 *
 * Programs arrive on the `bw-arduboy-load` event rather than through
 * props, the same way the micro:bit pane takes a flash, so the Code tab's
 * Open button does not have to reach into this component's tree.
 */
import PropTypes from 'prop-types';
import React from 'react';

import {
    createArduboy, framebufferToPixels, BUTTONS, SCREEN_WIDTH, SCREEN_HEIGHT
} from '../../lib/bw-arduboy/index.js';

/** Keyboard, chosen to match the Arcade pane's arrows plus Z/X. */
const KEY_TO_BUTTON = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    z: 'a', Z: 'a', ' ': 'a', x: 'b', X: 'b', Enter: 'b'
};

const LABEL = {up: '▲', down: '▼', left: '◀', right: '▶', a: 'A', b: 'B'};

/**
 * A frame can be no longer than this. A tab left in the background for a
 * minute must not come back and run the console for a minute of its own
 * time in one blocking call.
 */
const MAX_STEP_MS = 50;

/**
 * How long a press is held for, at minimum.
 *
 * The game polls its buttons once a frame. A finger on real hardware is
 * down for a tenth of a second and cannot be missed; a mouse click is
 * about ten milliseconds and falls between two polls, so a quick tap does
 * nothing at all. Releases are deferred to this floor — which is not a
 * fudge for the tests, it is the difference between the buttons working
 * and only working if you hold them.
 */
const MIN_PRESS_MS = 120;

/**
 * The band a speaker toggle is treated as a note in.
 *
 * Below this the pin is doing something that is not a tone; above it, the
 * measurement is noise from a handful of edges in one frame. A piezo on
 * this hardware is not asked for anything outside it.
 */
const MIN_HZ = 40;
const MAX_HZ = 8000;

const isGerman = () => /^de/i.test(
    (typeof navigator === 'undefined' ? '' : navigator.language) || '');

const T = {
    empty: [
        'No program loaded. Open an Arduboy .hex from the Code tab.',
        'Kein Programm geladen. Öffne eine Arduboy-.hex im Code-Tab.'
    ],
    pause: ['Pause', 'Pause'],
    resume: ['Resume', 'Fortsetzen'],
    reset: ['Reset', 'Zurücksetzen'],
    mute: ['Mute', 'Ton aus'],
    unmute: ['Sound', 'Ton an'],
    keys: [
        'Arrow keys move, Z is A, X is B.',
        'Pfeiltasten bewegen, Z ist A, X ist B.'
    ]
};
const tx = key => T[key][isGerman() ? 1 : 0];

class ArduboyPane extends React.Component {
    constructor (props) {
        super(props);
        this.state = {name: null, running: false, error: null, held: {}, muted: false,
            led: {r: 0, g: 0, b: 0}};
        this.canvasRef = React.createRef();
        this.console = null;
        this.pixels = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
        this.imageData = null;
        this.rafHandle = null;
        this.lastTime = 0;
        this.pressedAt = Object.create(null);
        this.releaseTimers = Object.create(null);
        this.audio = null;
        this.toggleMute = this.toggleMute.bind(this);

        this.onLoadEvent = this.onLoadEvent.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.tick = this.tick.bind(this);
        this.togglePause = this.togglePause.bind(this);
        this.reset = this.reset.bind(this);
    }

    componentDidMount () {
        window.addEventListener('bw-arduboy-load', this.onLoadEvent);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        // A program may have been handed over before this pane mounted —
        // the Open button switches the dock and loads in the same gesture.
        if (window.__bwArduboyPending) {
            const pending = window.__bwArduboyPending;
            window.__bwArduboyPending = null;
            this.load(pending.hex, pending.name);
        }
    }

    /**
     * The oscillator, made on the first gesture and not before.
     *
     * Browsers refuse to start audio without one, so this cannot live in
     * componentDidMount: it would be created suspended, and every tone
     * after that would be silent with nothing to show why.
     */
    ensureAudio () {
        if (this.audio || this.muted) return null;
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try {
            const ctx = new Ctor();
            const gain = ctx.createGain();
            gain.gain.value = 0;
            gain.connect(ctx.destination);
            const osc = ctx.createOscillator();
            // A piezo across two pins is a square wave and sounds like one.
            osc.type = 'square';
            osc.frequency.value = 440;
            osc.connect(gain);
            osc.start();
            this.audio = {ctx, gain, osc};
        } catch (e) {
            this.audio = null;
        }
        return this.audio;
    }

    /** Follow the speaker pin for one frame's worth of toggling. */
    updateAudio () {
        const audio = this.audio;
        if (!audio || !this.console) return;
        if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
        const {hz} = this.console.takeSpeaker();
        const audible = hz >= MIN_HZ && hz <= MAX_HZ && !this.state.muted;
        const now = audio.ctx.currentTime;
        if (audible) audio.osc.frequency.setTargetAtTime(hz, now, 0.005);
        // Ramp rather than switch, or every note starts and ends with a click.
        audio.gain.gain.setTargetAtTime(audible ? 0.06 : 0, now, 0.01);
    }

    /**
     * The RGB LED, as the eye would see it.
     *
     * The duty cycles are small — a game asking for level 16 of 255 gives
     * 0.06 — so showing them raw would be a black dot. The gamma-ish curve
     * here is for looking at, not for measuring; anything that wants the
     * number reads takeLed().
     */
    updateLed () {
        const led = this.console.takeLed();
        const previous = this.state.led;
        const changed = ['r', 'g', 'b'].some(k => Math.abs(led[k] - previous[k]) > 0.004);
        if (changed) this.setState({led});
    }

    toggleMute () {
        const muted = !this.state.muted;
        this.setState({muted});
        if (muted && this.audio) this.audio.gain.gain.value = 0;
    }

    componentWillUnmount () {
        window.removeEventListener('bw-arduboy-load', this.onLoadEvent);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        for (const timer of Object.values(this.releaseTimers)) clearTimeout(timer);
        this.releaseTimers = Object.create(null);
        if (this.audio) {
            try {
                this.audio.osc.stop();
                this.audio.ctx.close();
            } catch (e) { /* already gone */ }
            this.audio = null;
        }
        this.stop();
    }

    onLoadEvent (event) {
        const detail = (event && event.detail) || {};
        if (detail.hex) this.load(detail.hex, detail.name);
    }

    load (hex, name) {
        this.stop();
        this.hexText = hex;
        try {
            this.console = createArduboy(hex);
            this.setState({name: name || 'program.hex', error: null, running: true},
                () => this.start());
        } catch (e) {
            this.console = null;
            this.setState({error: String(e && e.message || e), running: false});
        }
    }

    start () {
        this.lastTime = 0;
        if (this.rafHandle === null) this.rafHandle = requestAnimationFrame(this.tick);
    }

    stop () {
        if (this.rafHandle !== null) {
            cancelAnimationFrame(this.rafHandle);
            this.rafHandle = null;
        }
    }

    togglePause () {
        const running = !this.state.running;
        this.setState({running}, () => (running ? this.start() : this.stop()));
    }

    reset () {
        // Rebuilding IS the reset: the CPU, the display and every held
        // button come back to power-on together, which is what pulling the
        // battery does and what a game's own reset path cannot guarantee.
        if (this.hexText) this.load(this.hexText, this.state.name);
    }

    tick (now) {
        this.rafHandle = null;
        if (!this.console || !this.state.running) return;
        const elapsed = this.lastTime ? Math.min(now - this.lastTime, MAX_STEP_MS) : 16;
        this.lastTime = now;
        try {
            this.console.advance(elapsed);
            this.paint();
            this.updateAudio();
            this.updateLed();
        } catch (e) {
            this.setState({error: String(e && e.message || e), running: false});
            return;
        }
        this.rafHandle = requestAnimationFrame(this.tick);
    }

    paint () {
        const canvas = this.canvasRef.current;
        if (!canvas || !this.console) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (!this.imageData) this.imageData = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
        framebufferToPixels(this.console.framebuffer, this.pixels);
        const data = this.imageData.data;
        const lit = this.console.display.displayOn;
        for (let i = 0; i < this.pixels.length; i++) {
            const on = lit && this.pixels[i];
            data[i * 4] = on ? 0xe8 : 0x0d;
            data[i * 4 + 1] = on ? 0xf1 : 0x11;
            data[i * 4 + 2] = on ? 0xff : 0x18;
            data[i * 4 + 3] = 0xff;
        }
        ctx.putImageData(this.imageData, 0, 0);
    }

    setButton (button, down) {
        if (!this.console) return;
        if (down) {
            this.ensureAudio();
            this.pressedAt[button] = Date.now();
            if (this.releaseTimers[button]) {
                clearTimeout(this.releaseTimers[button]);
                delete this.releaseTimers[button];
            }
        } else {
            const heldFor = Date.now() - (this.pressedAt[button] || 0);
            if (heldFor < MIN_PRESS_MS) {
                // Let go later, so the game gets a chance to look.
                this.releaseTimers[button] = setTimeout(
                    () => {
                        delete this.releaseTimers[button];
                        this.applyButton(button, false);
                    },
                    MIN_PRESS_MS - heldFor);
                return;
            }
        }
        this.applyButton(button, down);
    }

    applyButton (button, down) {
        if (!this.console) return;
        this.console.setButton(button, down);
        this.setState(prev => ({held: {...prev.held, [button]: down}}));
    }

    /**
     * The listener is on `window`, because a console you have to click
     * before it takes the arrow keys is a console nobody enjoys. That
     * means it also sees keys meant for the editor in the other column —
     * Z and X are ordinary letters — so anything typed into a field is
     * left alone.
     */
    isTyping (event) {
        const el = event.target;
        if (!el || !el.tagName) return false;
        return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
    }

    onKeyDown (event) {
        const button = KEY_TO_BUTTON[event.key];
        if (!button || !this.console || this.isTyping(event)) return;
        event.preventDefault();
        this.setButton(button, true);
    }

    onKeyUp (event) {
        const button = KEY_TO_BUTTON[event.key];
        if (!button || !this.console || this.isTyping(event)) return;
        event.preventDefault();
        this.setButton(button, false);
    }

    renderButton (button) {
        const down = !!this.state.held[button];
        return (
            <button
                data-testid={`bw-arduboy-${button}`}
                key={button}
                onPointerCancel={() => this.setButton(button, false)}
                onPointerDown={event => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    this.setButton(button, true);
                }}
                onPointerUp={event => {
                    event.preventDefault();
                    this.setButton(button, false);
                }}
                style={{
                    appearance: 'none', WebkitAppearance: 'none', touchAction: 'none',
                    userSelect: 'none', minWidth: 44, minHeight: 44, borderRadius: 8,
                    border: '2px solid rgba(255,255,255,.34)', color: '#fff',
                    fontWeight: 800, fontSize: 16, cursor: 'pointer',
                    background: down ? '#38bdf8' : (button === 'a' || button === 'b' ? '#e11d48' : '#172033'),
                    transform: down ? 'translateY(2px)' : 'none'
                }}
                type="button"
            >{LABEL[button]}</button>
        );
    }

    render () {
        return (
            <div
                data-testid="bw-arduboy-pane"
                style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 12, padding: 16, background: '#0f172a', color: '#e2e8f0',
                    height: '100%', boxSizing: 'border-box', overflow: 'auto'
                }}
            >
                <div style={{fontWeight: 700, fontSize: 13, letterSpacing: '.04em'}}>
                    {'ARDUBOY'}{this.state.name ? ` — ${this.state.name}` : ''}
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                    <div
                        aria-label="RGB LED"
                        data-testid="bw-arduboy-led"
                        style={{
                            width: 16, height: 16, borderRadius: '50%',
                            border: '2px solid #334155',
                            background: `rgb(${
                                [this.state.led.r, this.state.led.g, this.state.led.b]
                                    .map(v => Math.round(255 * Math.min(1, Math.pow(v, 0.45))))
                                    .join(', ')})`,
                            boxShadow: (this.state.led.r + this.state.led.g + this.state.led.b) > 0.01 ?
                                '0 0 10px rgba(255,255,255,.5)' : 'none'
                        }}
                    />
                    <span style={{fontSize: 11, color: '#64748b'}}>{'LED'}</span>
                </div>
                <canvas
                    data-testid="bw-arduboy-screen"
                    height={SCREEN_HEIGHT}
                    ref={this.canvasRef}
                    style={{
                        width: '100%', maxWidth: 512, imageRendering: 'pixelated',
                        border: '3px solid #334155', borderRadius: 6, background: '#0d1118',
                        aspectRatio: `${SCREEN_WIDTH} / ${SCREEN_HEIGHT}`
                    }}
                    width={SCREEN_WIDTH}
                />
                {this.state.error ? (
                    <div
                        data-testid="bw-arduboy-error"
                        style={{color: '#fca5a5', fontSize: 12, textAlign: 'center'}}
                    >{this.state.error}</div>
                ) : null}
                {this.console ? null : (
                    <div
                        data-testid="bw-arduboy-empty"
                        style={{color: '#94a3b8', fontSize: 12, textAlign: 'center'}}
                    >{tx('empty')}</div>
                )}
                <div style={{display: 'flex', gap: 24, alignItems: 'center'}}>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gap: 4}}>
                        <span />{this.renderButton('up')}<span />
                        {this.renderButton('left')}<span />{this.renderButton('right')}
                        <span />{this.renderButton('down')}<span />
                    </div>
                    <div style={{display: 'flex', gap: 8}}>
                        {this.renderButton('b')}{this.renderButton('a')}
                    </div>
                </div>
                <div style={{display: 'flex', gap: 8}}>
                    <button
                        data-testid="bw-arduboy-pause"
                        disabled={!this.console}
                        onClick={this.togglePause}
                        style={{padding: '6px 14px', borderRadius: 6, cursor: 'pointer'}}
                        type="button"
                    >{this.state.running ? tx('pause') : tx('resume')}</button>
                    <button
                        data-testid="bw-arduboy-reset"
                        disabled={!this.hexText}
                        onClick={this.reset}
                        style={{padding: '6px 14px', borderRadius: 6, cursor: 'pointer'}}
                        type="button"
                    >{tx('reset')}</button>
                    <button
                        data-testid="bw-arduboy-mute"
                        onClick={this.toggleMute}
                        style={{padding: '6px 14px', borderRadius: 6, cursor: 'pointer'}}
                        type="button"
                    >{this.state.muted ? tx('unmute') : tx('mute')}</button>
                </div>
                <div style={{color: '#64748b', fontSize: 11}}>{tx('keys')}</div>
            </div>
        );
    }
}

ArduboyPane.propTypes = {
    vm: PropTypes.object
};

export {BUTTONS};
export default ArduboyPane;
