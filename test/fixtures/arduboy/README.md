# Arduboy fixture

`rysk.hex` is [RYSK v0.10](https://github.com/obono/ArduboyWorks) by OBONO,
**MIT licensed**, taken unmodified from that repository's `_hexs/` directory.

It is here because it is a *compiled* game — 15 KB of AVR machine code with
no source of any kind inside it — which is the whole point. Every other
fixture in this tree carries its own source and is a parsing problem; this
one can only be answered by running it. It boots, initialises its display
with 14 SPI commands and reaches its title screen in under a second of
simulated time, which is what the tests assert.

The repository ships 19 such `.hex` files, so no avr-gcc is involved
anywhere in this: the games are distributed built.
