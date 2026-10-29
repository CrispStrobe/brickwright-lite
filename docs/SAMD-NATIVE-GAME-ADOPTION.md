# SAMD software-profile engine adoption

Status: upstream assembly, qualification and immutable engine release are
complete. Consumer [PR1533](https://github.com/CrispStrobe/brickwright-lite/pull/1533)
remains unmerged at `48df0f93f9b6b642238c13448e6f075d8871eb83`; source CI and
fresh browser/installed acceptance are pending. No normal native SAMD GUI route
has landed. Continue the [current handoff](SAMD-NATIVE-GAME-HANDOFF.md), refresh
remote state, and reuse retained originals rather than repeating supplier work.

The owned supplier fixes are qualified and merged:

- [CODAL PR91](https://github.com/CrispStrobe/codal-samd/pull/91) selects TC/TCC
  using the actual timer id in the owned compile copy. Both scheduler profiles
  pass natural TCC0 runtime/USB/HF2 checks, original-source panic90 and masked
  interrupt controls; all84 native results and source/config/image joins passed.
- [CODAL PR92](https://github.com/CrispStrobe/codal-samd/pull/92) adds an opt-in
  authored RGB444 runtime profile that sends its complete RGBSET table over the
  actual SPI path. The positive and short/missing-upload controls pass in both
  profiles; all90 native results and independent controller-memory audits passed.

The explicit [Core PR262](https://github.com/CrispStrobe/labwired-core/pull/262)
assembly registers the existing controller-memory codec and qualified peripheral
models under a separate software profile. The historical PyBadge descriptor is
not substituted for this assembly. The two1KiB input windows contain authored
calibration/serial packets; they are not hardware captures or physical page-size
measurements. A colour is unknown until the actual guest uploads the complete
RGBSET table. No host-installed default LUT is permitted.

## Completed work and remaining acceptance

1. **Done — explicit Core assembly.**
   [Core PR262](https://github.com/CrispStrobe/labwired-core/pull/262) merged as
   `3b655aef4085082152129c84849d4e2ad5004a7f` after fleet, selected guest and CLI
   qualification. Do not substitute the historical PyBadge descriptor. Original
   failures, authored inputs and qualification limits remain retained.
2. **Done — source-built native and Node game evidence.** The
   [native/Node campaign](https://github.com/CrispStrobe/codal-samd/pull/93)
   passed six independently audited samples. The original paused-menu failure
   came from active-high virtual input IDs; the authored game selects the
   runtime's existing active-low IDs1050–1057. Budgets, runtime, physical input
   model and picture assertions remain unchanged.
   [Results and limits](https://github.com/CrispStrobe/codal-samd/blob/35ca8138ae4f7b9b9ecb5dc9a1d04dbf02e5619f/docs/SAMD-NATIVE-GAME-RESULTS.md)
   establish functional execution, not real-time playability or Lite acceptance.
3. **Done — production WASM and immutable release.**
   [BW PR711](https://github.com/CrispStrobe/bw-board/pull/711) merged after its
   enabled checks and independent retained-original audit.
   [Producer40699886470](https://github.com/CrispStrobe/bw-board/actions/runs/40699886470)
   passed two hosted builds, determinism, 125 legacy tests and three production
   game samples. Engine, glue, Node loader marker and exact-source profile bytes
   match across builds. The
   [locked release](https://github.com/CrispStrobe/bw-board/releases/tag/labwired-wasm-3b655aef-locked)
   has API `immutable: true`; its nine asset digests match the qualified originals.
   Motion qualification remains deferred. Keep component notices and the narrow
   Node 22 inlining workaround documented by the
   [producer handoff](https://github.com/CrispStrobe/bw-board/blob/master/docs/SAMD-ENGINE-RELEASE-HANDOFF.md).
4. **Partly done — emitted assets verified; full source CI pending.** PR1533
   proposes the exact engine/glue/profile hashes and matching performance identity.
   Its official frontend job and all six unit shards passed; independent review
   verified all 8,563 emitted files and exact release asset hashes. Full Rust tests
   and E2E passed. Preserve original failures; the old native failure's cause
   remains unknown. Remaining browser/FPGA/Arcade source checks must pass before
   actual-game dispatch or merge. Preparatory native run40803428616 is already
   queued with unchanged compile defaults; do not dispatch another. This overlap
   preserves all final source and actual-guest gates. Follow the
   [current handoff](SAMD-NATIVE-GAME-HANDOFF.md) for exact identities and order.
5. **Pending — actual consumer and landing.** Audit the existing source-bound
   native build and wait for every enabled source check. Then run
   three fresh actual Chromium and three installed Tauri/WebKit instances of the
   same source-built guest on the shipped engine assets. Independently check raw
   RGB movement, actual press/release, sampled RSS and complete source/frontend/
   executable/engine/profile/firmware joins. Only after those and every enabled
   final-head check pass, merge normally with matched-head protection, verify
   parents/tree, update these records and close both existing claims. Preserve
   other owners' vendor/importer/package changes.

## Separate work

A new native SAMD compile/import/export/GUI route needs its own target selection,
configuration, supported-format/refusal, input/display and installed interaction
contract. An engine asset pin does not add that route. Physical panel/aperture,
gamma, analogue colour, electrical timing, silicon recaptures and universal
real-time speed need their own evidence. This lane makes none of those claims.

## Hosted qualifier registration

The dispatch-only `samd-native-game-qualification.yml` accepts full consumer and
producer commits plus exact automatic frontend, native executable and engine
producer run identities. Its admission job checks official metadata before one
acquisition of each original, verifies publisher archive digests, checks safe
closed archive membership, independently joins the actual CI checkout, complete
frontend inventory, native source and executable receipt, and admits the exact
engine/profile/guest inputs. Only declared Markdown composition differences are
allowed between the reviewed consumer and its actual frontend checkout.

Subsequent jobs run three fresh engine instances in actual Chromium and the
actual embedded Tauri/WebKit editor, using its shipped assets. The collector
independently decodes each returned RGB frame and checks targets, movement and
press/release phases. The observer canvas is a raw controller-memory view; it
does not implement a product native compile/import route. No private runtime
resource is supplied or claimed. Registering this infrastructure does not change
the engine pin or qualify an actual guest; retain status as pending until the
exact consumer has passed both jobs and the remaining enabled checks.

Memory observations distinguish JavaScript heap statistics from process RSS.
The hosted collectors sample summed RSS once per second over the Node observer
and descendants (including Chromium and sampler overhead), or the owned Tauri
driver and installed-app/WebKit descendants. Results state the scope, sample times and largest observed sum.
Shared pages count in each process; this is neither proportional memory nor a
continuous peak. WebKit may omit JavaScript heap statistics; RSS observations
remain required. No actual memory result is claimed before those runs pass.
