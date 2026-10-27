# SAMD software-profile engine adoption

Status: qualification in progress. No engine pin or shipped native SAMD GUI route
has changed in this lane. The existing Arcade JavaScript route remains separate.

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

## Required sequence before adoption can close

1. Complete the explicit Core assembly's enabled final-head checks and actual
   CLI guest coverage. The [native/Node WASM game campaign](https://github.com/CrispStrobe/codal-samd/pull/93)
   passed all six independently audited samples. Its original picture failure
   was the paused system menu caused by active-high virtual input IDs; the
   authored game now selects the runtime's existing active-low IDs1050–1057.
   Original budgets, runtime, physical input model and picture assertions remain.
   [Measured results and limits](https://github.com/CrispStrobe/codal-samd/blob/35ca8138ae4f7b9b9ecb5dc9a1d04dbf02e5619f/docs/SAMD-NATIVE-GAME-RESULTS.md)
   establish functional execution, not real-time playability or Lite adoption.
2. Retain the independently audited official original source, compiler inputs, firmware,
   chip/system/display, calibration, render frames and three fresh samples per
   engine. Record startup, render-return intervals, input latency and process
   memory with observation costs and limits. Node execution alone does not
   qualify a browser or installed app.
3. Land the qualified supplier source. Build the engine and its exact-source
   profile asset twice on independent hosted runners. Require identical engine,
   glue, loader marker and profile bytes, the complete existing legacy suite,
   and the same active game on the production WASM. Retain component notices,
   original failures and immutable release identities.
4. Publish an immutable release; update Lite's exact engine/profile SHA256 pins
   and matching performance-workflow identity together. The portable
   `scripts/verify-samd-native-game.mjs` admits the pinned profile, all exact
   source YAML and complete authored input identities. Metadata admission is
   explicitly not an actual-guest qualification result.
5. Qualify the same source-built guest on actual browser WASM and the installed
   package, binding engine/configuration/firmware/frontend/native package bytes
   and checking moving frames plus actual press/release. Pass all enabled
   exact-head consumer checks, then land the qualified consumer and close its
   adoption claim. Keep other owners' vendor/importer/package changes intact.

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
