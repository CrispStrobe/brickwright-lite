/**
 * Arduboy — an ATmega32U4 game console, run on avr8js.
 *
 * The Arduboy is the one 8-bit console whose games are distributed as
 * plain AVR `.hex`, so unlike a MakeCode Arcade cartridge there is no
 * source to translate and no ARM core to emulate: the binary is the
 * program, and we already ship the CPU that runs it. What this module
 * adds is everything around the CPU — the board that answers its pins,
 * the display on the other end of its SPI bus, and the one register the
 * Arduino core will not boot without.
 *
 * THE ONE REGISTER. The Arduino core for this chip brings up USB before
 * `setup()` runs, and its first act is
 *
 *     IN   r0, 0x29     ; PLLCSR
 *     SBRS r0, 0        ; PLOCK
 *     RJMP -3
 *
 * — spin until the USB PLL reports lock. avr8js has no PLL, so PLOCK
 * never sets and every Arduboy game hangs three instructions into the
 * core, before a single line of the game runs. It reads like "USB is not
 * emulated, this is hopeless"; it is one bit. `PLL_LOCK` below sets it.
 * Nothing else about USB is modelled and nothing else needs to be: a
 * game never enumerates, it just wants the clock.
 *
 * Everything else is ordinary. The display is an SSD1306 — the same
 * controller `bw-board/devices/ssd1306.js` already models for I2C parts,
 * driven here through its SPI front end. The buttons are active-low with
 * pull-ups. The speaker is a pin pair we report the state of and leave
 * to the caller to sound.
 *
 * @module
 */

import {parseIntelHex} from '../bw-board/intel-hex.js';
import {createAvr8jsAdapter} from '../bw-board/avr8js-adapter.js';
import {createSSD1306SPI} from '../bw-board/devices/ssd1306.js';

/** PLLCSR, in data space. Bit 1 enables the USB PLL, bit 0 says it locked. */
const PLLCSR = 0x49;

/** SPDR — every byte the MCU pushes to the display goes through here. */
const SPDR = 0x4e;

export const SCREEN_WIDTH = 128;
export const SCREEN_HEIGHT = 64;

/** The six buttons, in the order a d-pad plus two actions is usually drawn. */
export const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b'];

/**
 * Is this text an AVR program we could run?
 *
 * Deliberately weak: it answers "Intel HEX holding AVR code that fits a
 * 32U4", not "an Arduboy game", because nothing in the file says which
 * console it was built for. The caller decides what to do with a maybe.
 */
export function looksLikeAvrHex (text) {
    if (typeof text !== 'string' || !/^\s*:[0-9A-Fa-f]{8}/.test(text)) return false;
    let program;
    try {
        program = parseIntelHex(text, 0x8000);
    } catch (e) {
        return false;
    }
    const words = program.reduce((n, w) => n + (w ? 1 : 0), 0);
    if (words < 64) return false;                       // an empty or stub image
    // The reset vector is the first thing on any AVR: JMP (0x940C/0x940D)
    // on a part this size, or RJMP (0xCxxx) on a small one.
    const reset = program[0];
    return (reset & 0xfe0e) === 0x940c || (reset & 0xf000) === 0xc000;
}

/**
 * Run an Arduboy program.
 *
 * @param {string} hexText - the .hex file, as text
 * @param {object} [opts]
 * @param {(fb: Uint8Array) => void} [opts.onFrame] - called with the 1024-byte
 *   GDDRAM after each batch of work; page-major, 8 vertical pixels per byte
 * @returns {object} the runner
 */
export function createArduboy (hexText, opts = {}) {
    const program = parseIntelHex(hexText, 0x8000);
    const adapter = createAvr8jsAdapter({chip: 'atmega32u4', program});
    const cpu = adapter.cpu;
    const display = createSSD1306SPI();

    // See THE ONE REGISTER above. PLLE (bit 1) set → PLOCK (bit 0) set.
    // Silicon takes about 100 us; nothing in a game measures that.
    cpu.writeHooks[PLLCSR] = value => {
        cpu.data[PLLCSR] = (value & 0x12) | ((value & 0x02) ? 0x01 : 0x00);
        return true;
    };

    const held = Object.create(null);
    const pins = {dc: false, cs: true, reset: true, speaker1: false, speaker2: false};
    let speakerEdges = 0;

    // Time-weighted duty cycle per LED channel. A PWM pin is only ever
    // fully on or fully off; the colour is in how long it stays each way.
    const led = {
        r: {lit: false, since: 0, litNs: 0},
        g: {lit: false, since: 0, litNs: 0},
        b: {lit: false, since: 0, litNs: 0}
    };
    const integrate = (channel, lit) => {
        const ch = led[channel];
        const now = adapter.timeNs ? Number(adapter.timeNs()) : 0;
        if (ch.lit) ch.litNs += now - ch.since;
        ch.lit = lit;
        ch.since = now;
    };

    // The board is the adapter's own boundary: it answers reads on pins the
    // MCU has left as inputs, and is told about every pin the MCU drives.
    adapter.attachBoard({
        readPin (name) {
            // Buttons are active LOW with pull-ups: released reads 1.
            if (name.startsWith('BTN_')) return held[name.slice(4).toLowerCase()] ? 0 : 1;
            return 1;
        },
        setPin (name, mode, driveHigh) {
            switch (name) {
            case 'OLED_DC': pins.dc = !!driveHigh; break;
            case 'OLED_CS': pins.cs = !!driveHigh; break;
            case 'OLED_RST':
                // RES# is active low, and the reset edge is what matters.
                if (pins.reset && !driveHigh) display.reset();
                pins.reset = !!driveHigh;
                break;
            // The speaker is a piezo across two pins, driven by Timer3's
            // compare output. There is no frequency register to read that
            // would survive a game changing how it makes noise, so what
            // gets counted is the thing that is actually true of a tone:
            // the pin is toggling, and how often.
            case 'SPEAKER_1':
                if (pins.speaker1 !== !!driveHigh) speakerEdges++;
                pins.speaker1 = !!driveHigh;
                break;
            case 'SPEAKER_2': pins.speaker2 = !!driveHigh; break;
            // The RGB LED is common-anode: the pin is pulled LOW to light
            // it, and brightness is PWM, so the level at any instant says
            // almost nothing. What means something is the fraction of the
            // window the pin spent low, which is what gets integrated.
            case 'RGB_RED': integrate('r', !driveHigh); break;
            case 'RGB_GREEN': integrate('g', !driveHigh); break;
            case 'RGB_BLUE': integrate('b', !driveHigh); break;
            default: break;
            }
        },
        readPinVoltage: () => 0,
        advanceTo: () => {}
    });

    // Every byte the MCU writes to SPDR is on the display bus. CS is
    // checked because the Arduboy shares SPI with its (unpopulated) flash
    // header, and a byte sent while CS is high is not for the screen.
    const previous = cpu.writeHooks[SPDR];
    let bytesToDisplay = 0;
    cpu.writeHooks[SPDR] = (value, ...rest) => {
        if (!pins.cs) {
            display.byte(value, pins.dc);
            bytesToDisplay++;
        }
        return previous ? previous(value, ...rest) : (cpu.data[SPDR] = value, true);
    };

    let nanos = 0;
    let speakerSince = 0;
    let ledSince = 0;

    return {
        display,
        adapter,
        get framebuffer () { return display.fb; },
        get bytesToDisplay () { return bytesToDisplay; },
        /** Speaker pin states, for a caller that wants to make a noise. */
        get speaker () { return {a: pins.speaker1, b: pins.speaker2}; },

        /**
         * The RGB LED as three 0..1 duty cycles over the window since this
         * was last called, which resets it for the same reason the speaker
         * does. A channel that never changed is reported at its current
         * level, or a pin held steadily on would read as off.
         */
        takeLed () {
            const now = adapter.timeNs ? Number(adapter.timeNs()) : 0;
            const out = {};
            for (const key of ['r', 'g', 'b']) {
                const ch = led[key];
                if (ch.lit) ch.litNs += now - ch.since;
                ch.since = now;
                const span = now - ledSince;
                out[key] = span > 0 ? Math.min(1, ch.litNs / span) : 0;
                ch.litNs = 0;
            }
            ledSince = now;
            return out;
        },

        /**
         * Edges on the speaker pin since this was last called, and the
         * simulated milliseconds they happened over. A full cycle is two
         * edges, so the tone is `edges / 2 / seconds`.
         *
         * Reading resets the count, because the caller is sampling a rate
         * and a total it never clears would only ever go up.
         */
        takeSpeaker () {
            const edges = speakerEdges;
            const ms = (nanos - speakerSince) / 1e6;
            speakerEdges = 0;
            speakerSince = nanos;
            return {edges, ms, hz: ms > 0 ? (edges / 2) / (ms / 1000) : 0};
        },

        press (button) { held[button] = true; },
        release (button) { held[button] = false; },
        setButton (button, down) { held[button] = !!down; },
        isPressed (button) { return !!held[button]; },

        /**
         * Advance the console by `ms` of its own time. The caller decides
         * how often to do this; one call per animation frame with the real
         * elapsed time keeps the game at its intended speed.
         */
        advance (ms) {
            const slice = 1_000_000;                    // 1 ms, so inputs are sampled often
            let left = Math.max(0, ms);
            while (left > 0) {
                const step = Math.min(1, left);
                adapter.syncInputs();
                adapter.advanceNs(step * slice);
                nanos += step * slice;
                left -= step;
            }
            if (opts.onFrame) opts.onFrame(display.fb);
        },

        /** Simulated time since reset, in milliseconds. */
        get elapsedMs () { return nanos / 1e6; },
        get instructions () { return adapter.stats.instructions; }
    };
}

/**
 * The 1024-byte GDDRAM as one byte per pixel (0 or 255), row-major —
 * the shape a canvas ImageData wants.
 */
export function framebufferToPixels (fb, out) {
    const pixels = out || new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
    for (let page = 0; page < 8; page++) {
        for (let x = 0; x < SCREEN_WIDTH; x++) {
            const bits = fb[page * SCREEN_WIDTH + x];
            for (let bit = 0; bit < 8; bit++) {
                pixels[(page * 8 + bit) * SCREEN_WIDTH + x] = (bits >> bit) & 1 ? 255 : 0;
            }
        }
    }
    return pixels;
}

export default createArduboy;
