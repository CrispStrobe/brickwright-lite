# LabWired debugger engineering-input route — 2026-10-01

This slice is based on cached Lite `9facdb442` and BW `7ca77580` plus its
selected-motion follow-up. GitHub was unreachable; no new remote merge,
package promotion or fresh-engine qualification is claimed. CP13 stays open.

The current LabWired attach path is **directly through the debugger runner**,
not a separate LabWired worker. The runner now exposes `discoverInputs()` and
`setInputs(sets)` on its current target. An input write uses the existing
forward-history boundary, then exactly one target transaction; successful
writes refresh inspection. Missing targets or capabilities remain explicit.
There is no synthetic input fact or sequential channel fallback in Lite.

For a board-derived micro:bit target, `createDebugRunner` accepts
`labwiredBoardVariant: 'lsm303agr'`. The option passes through to BW's factory;
older packages without that declared variant fail explicitly. A firmware-only
catalog override cannot silently ignore a selected board variant. The default
is still the existing matrix-only board, and no panel selector or pose UI has
been added yet. Installed BW/WASM pins are unchanged.

The overlay and checked-in package copies of the runner and helper match.
Eleven route/unit assertions passed. Four actual-WASM tests passed with zero
skips using historical release `labwired-wasm-0c0cd0ec` and two real
potentiometers: scoped discovery, one atomic input fact, no partial write on
rejection, target replay without duplicate facts, and the production recording
subscription while active/inactive and after unsubscribe. The latter uses a
recording-session double; it does not qualify complete checkpoint sessions.
This engine lacks a pre-application input-admission hook, so lossless recorder
veto is **not** claimed. Circuit replay remains unsupported.

Reproduce the real route proof with `BW_PACKAGE_ROOT` pointing to the BW
package parent, `LABWIRED_INPUT_WEB_GLUE` and `LABWIRED_INPUT_WEB_WASM` pointing
to original WEB release assets, and `BW_REQUIRE_ENGINE_INPUT_PROOF=1`:

```sh
node test/engineering-input-route-wasm.test.mjs
```

The reused assets have SHA256
`a25e1e596ae1afb97e946b9658e466b907908e1f36fb32e9cfb00c0ac0dd848f` (glue)
and `ea1e375ae2f29decc2dbf5774f0266ab6d9343fdd5213066f7dba58e98db0a47`
(WASM). These are generic held-input tests under Node: not LSM303AGR, guest
execution, browser rendering or throughput proof. Direct twin-file comparisons
passed. The initial restricted session blocked the full mirror checker; it
passed after access was restored. Full build CI exposed a stale 3D isolation
guard expecting the retired `bw-spike-arena` chunk. The guard now inspects the
actual `bw-spike-simulator` chunk and still rejects missing chunks or eager
3D payloads; its negative-control and source-drift tests pass locally.

Next: land the paired BW/Lite slices; qualify BW's fresh selected-motion NODEJS
guest and all five unchanged ≥1× windows without publishing; then browser
guest/debugger tests, verified package/artifact promotion, and user-facing
pose controls. Shared sensor IRQ and timed audio remain separate milestones.
