const ArgumentType = require('../../../extension-support/argument-type');
const BlockType = require('../../../extension-support/block-type');
const Cast = require('../../../util/cast');
const formatMessage = require('format-message');

// Lite-native GPIO pin blocks. The DOS Forth bench exposes two prelude words,
// `pin! ( pin value -- )` and `pin@ ( pin -- value )`, that OUT/IN to the
// classic LPT1 data port 0x378+pin (8 pins, 0x378..0x37f); a write lights the
// Widgets pane's GPIO strip through the bw-fpga-leds / bw-fpga-output event
// pump the FPGA tab consumes (see tw-pseudocode/fpga-tab.jsx and the Forth DOS
// run bridge in pseudocode-importer.jsx). These two blocks surface the same
// pins in the palette, drive that same widget when a green-flag script runs
// them, and round-trip through the Code tab's Forth tab: `set pin N to V` ⇄
// `N V pin!`, `read pin N` ⇄ `N pin@` (bw-lang/forth.js). Numeric pins 0..7.
const GPIO_PINS = 8;

const COPY = {
    en: {name: 'GPIO Pins', setpin: 'set pin [PIN] to [VALUE]', readpin: 'read pin [PIN]'},
    de: {name: 'GPIO-Pins', setpin: 'Pin [PIN] auf [VALUE] setzen', readpin: 'Pin [PIN] lesen'}
};
const language = () => (String(formatMessage.setup().locale || 'en').toLowerCase().startsWith('de') ? 'de' : 'en');
const t = key => COPY[language()][key] || COPY.en[key] || key;

const clampPin = raw => {
    const n = Math.trunc(Cast.toNumber(raw));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n > GPIO_PINS - 1 ? GPIO_PINS - 1 : n;
};

class BwGpio {
    constructor (runtime) {
        this.runtime = runtime;
        // Pins seen as outputs (so the widget shows the whole strip once any
        // pin is driven) and the last value written to each (what read returns).
        this._pins = new Set();
        this._levels = {};
    }

    getInfo () {
        return {
            id: 'bwgpio',
            name: t('name'),
            color1: '#5CB1D6',
            color2: '#2E8EB8',
            color3: '#2E8EB8',
            blocks: [
                {
                    opcode: 'setpin',
                    blockType: BlockType.COMMAND,
                    text: t('setpin'),
                    arguments: {
                        PIN: {type: ArgumentType.STRING, menu: 'pins', defaultValue: '0'},
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 1}
                    }
                },
                {
                    opcode: 'readpin',
                    blockType: BlockType.REPORTER,
                    text: t('readpin'),
                    arguments: {
                        PIN: {type: ArgumentType.STRING, menu: 'pins', defaultValue: '0'}
                    }
                }
            ],
            menus: {
                pins: {
                    acceptReporters: false,
                    items: Array.from({length: GPIO_PINS}, (_, i) => String(i))
                }
            }
        };
    }

    // ( pin value -- ) drive 0x378+pin: remember the value and light the strip.
    setpin (args) {
        const pin = clampPin(args.PIN);
        const value = Cast.toNumber(args.VALUE);
        this._levels[pin] = value;
        this._pins.add(pin);
        const high = (Math.trunc(value) & 0xff) !== 0;
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
        // Same two events the Forth DOS run's onPortAccess bridge dispatches.
        window.dispatchEvent(new CustomEvent('bw-fpga-leds',
            {detail: {pins: [...this._pins].sort((a, b) => a - b)}}));
        window.dispatchEvent(new CustomEvent('bw-fpga-output',
            {detail: {leds: [{pin, high}]}}));
    }

    // ( pin -- value ) the last value written to the pin (0 until driven).
    readpin (args) {
        const pin = clampPin(args.PIN);
        return Object.prototype.hasOwnProperty.call(this._levels, pin) ? this._levels[pin] : 0;
    }
}

module.exports = BwGpio;
