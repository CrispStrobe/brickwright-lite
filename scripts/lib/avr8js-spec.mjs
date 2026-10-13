// The avr8js the GUI package declares. It must be the SAME commit bw-board
// depends on (bw-board #413: our fork, with the ATtiny85 Timer 1 PWM counted
// single-slope as the datasheet says). Before B15 the GUI declared npm
// `^0.21.0` beside it: nothing in the app imported that copy, but anything
// resolving `avr8js` from packages/scratch-gui got the old timer.
// test/avr8js-one-version.test.mjs holds this equal to the pinned bw-board's.
export const AVR8JS_SPEC = 'github:CrispStrobe/avr8js#feea84c43e36e578841b5fce640202823b69b7f7';
