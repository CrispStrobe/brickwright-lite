# Arcade: green-flag startup reset discount with its obligations (2b step)

Status: DONE in the implementing PR (claim and change together).
Owner: Arcade lane. First step of row 2b (`lanes/2026-11-03-arcade-pending-after-1643.md`);
the exporter half of #1685 is reworked separately on top of this.
Base: main `4b2f5047dde6a8609b5881c93b510028eb83fb07`.

## Change

`overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js`:
the export-check half of #1685, with two added obligations. A global reset
written by the green-flag script is dead at a read inside the parameterless
procedure that script alone calls once, after a non-reset writer of that
procedure has run on every path to the read. Added obligations:

- the project must be an owned project snapshot, like every other reset
  discount (the first version gave a raw, mutable project Array authority);
- the overwriting value may not contain a procedure, method, constructor or
  callable call, so only the existing identity-prefix proof can cross one.

The exporter is unchanged; staged locals in `__bwStartup` keep their reset, so
the 2b test itself stays TODO until the exporter half lands.

## Tests

`test/makecode-arcade-startup-null-reset.test.mjs` (from #1685, without its
exporter unit test): the positive case matches original PXT, eleven near
misses stay refused (including a new "the overwrite calls a procedure"), and a
mutable project gets no discount. Mutations: dropping the call obligation, the
snapshot obligation or the rule itself each fails a test.
