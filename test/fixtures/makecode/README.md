# MakeCode fixtures — where these came from

Three genuine MakeCode downloads, trimmed to the Intel HEX records / UF2
blocks that carry the embedded project source. Nothing here is synthesised:
the containers, the LZMA streams and the project JSON inside them are exactly
what the editors wrote.

| file | editor | project | trimmed from |
|---|---|---|---|
| `microbit-blocks.hex` | makecode.microbit.org 0.14.x | "pins test 1" | a 570 KB .hex download |
| `arcade-shield.hex` | arcade.makecode.com 4.0.x, micro:bit V2 + shield | "ping-pong" | a 1.0 MB .hex download |
| `arcade-shield.uf2` | the same project, UF2 build | "ping-pong" | a 700 KB .uf2 download |
| `arcade-assets.hex` | arcade.makecode.com, micro:bit V2 + shield | "Jonathans Ausweichspiel unterwasser" | a 1.0 MB .hex download |
| `arcade-tilemap.hex` | arcade.makecode.com, micro:bit V2 + shield | "jumpy platformer" | a 1.0 MB .hex download |

`arcade-tilemap.hex` is the only fixture with tilemaps — eight levels, a
`tilemap.g.ts` factory and a `tilemap.g.jres` tile set — and it is what
keeps the level renderer honest.

`arcade-assets.hex` earns its place by being the *friendly* Arcade case
and by carrying a `.g.jres` asset gallery: one script per sprite, a
160x120 background, spawn-by-clone. `arcade-shield.hex` is the hostile
one — a pong whose single script drives three sprites — and the pair is
what lets the tests assert both that a good translation happens and that
an impossible one is refused rather than faked.

**Why trimmed.** The parser scans for the source-embedding header and reads
only the records that follow it, so the megabyte of compiled ARM around it
contributes nothing but repository weight. Keeping the .hex and the .uf2 of
the *same* project is deliberate — it is what lets the test assert that the
two containers yield an identical file map.

**What is NOT here**, and why: a .png cartridge (a quarter-megabyte of
someone's artwork) and a micro:bit V2 MicroPython .hex (1.8 MB). Those two
paths are covered by round-trip tests against the writers in
`test/helpers/makecode-fixtures.mjs` instead.

To regenerate after a format change, take a fresh download and keep the
records from the one whose data begins `41140E2FB82FA2BB` until
`metaLen + textLen` bytes have been collected.
