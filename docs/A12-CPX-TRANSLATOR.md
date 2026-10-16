# Circuit Playground Express MakeCode import

A recovered MakeCode TypeScript project for Circuit Playground Express opens
as `DEVICE CPX` code. Building it produces the existing `circuitplayground`
blocks and device world. The original recovered files remain available for
MakeCode's own simulator and the original-source download.

This is a translator for the pinned **pxt-adafruit 1.6.8** vocabulary, using the
45 words delivered by [A9](A9-CPX-SCOPING.md). It adds no firmware emulator,
extension implementation or dependency pin.

## Target and source identity

An Adafruit editor URL selects `adafruit`. The project's non-empty
`circuit-playground` dependency also identifies CPX, including programs using
input/sound names shared by other target bundles. A target version number is
not a target name. Without a positive hint or that board-package identity,
CPX-specific vocabulary is checked before the shared micro:bit `input.on`
spelling. Comments and literal text cannot supply that CPX evidence. A known
micro:bit, Calliope, EV3 or Arcade hint retains priority. Shared vocabulary
alone cannot establish an otherwise ambiguous project's target.

Source-only `.mkcd` projects use the same import path as recovered firmware
projects and shares. Unknown container metadata may recover CPX from its
distinct vocabulary. CPX Python source and projects without `main.ts` are
refused by name; their original files remain available.

## Mappings and limits

Ring colours, brightness, gradients, graphs, animations, sensors, tones,
tempo, built-in sounds and static event handlers use the existing CPX words.
Commands and inputs are read by the actual dialect parser. Enum and built-in
sound spellings follow the MIT-licensed Microsoft target sources; their
upstream licence notices remain with the pinned runtime.

CPX already has event hats for buttons, touch, gestures, the switch, light,
temperature and loud sounds. These use the existing device input dispatcher,
rather than introducing a second polling implementation. Inline zero-argument
callbacks and uniquely declared zero-argument functions retain their bodies;
expression-bodied callbacks execute their command before returning.

Project hats start with the project. Dynamic registration and registration
after potentially yielding initialization are therefore refused by name.
This is conservative: a helper that could yield can withhold a later handler
even when one invocation would return immediately. No general event-bus,
registration-order, interruption or timing-equivalence claim follows from the
finite comparisons.

Photon operations, external strips, IR/cable networking, HID, storage,
datalogging, settings and unsupported pin/bus operations remain named refusals.
Custom melodies and per-play sound-volume arguments also remain refused.
Every returned refusal includes a reason and appears in an `# unsupported:`
comment. Calls inside an entirely refused construct are named too.

There is no qualified CPX MakeCode emitter. **MakeCode export is refused for
CPX**, instead of producing micro:bit source. Downloading the original recovered
source is a separate action and preserves the files as imported.

## Evidence and acceptance

Run `node scripts/makecode-census.mjs --only adafruit` to regenerate only the
CPX section of [the census](generated/MAKECODE-CENSUS.md), preserving the other
target sections. The source archive must match the existing exact tarball pin.
The exhaustive input is **244 code fences**, including 163 in projects and
tutorials; the earlier 149-program estimate was not the archive's full count.
There is no deduplication. Original source is checked by its own compiler;
compiler infrastructure failures cannot count as invalid source programs.

The import census records 149 full, 33 partial, 27 refused by name, 26
parser-warning cases and nine original-compiler refusals, with **zero silent
call losses**. “Full” describes import, parsing and source-call accounting;
it does not mean every program has a behavioural or re-export proof. Original
compiler failures include stale animation APIs and an incomplete `Anim`
example. Empty-body parser warnings remain visible.

Required behavioural qualification compares twelve unchanged documentation
programs in the original PXT simulator and, after translation and parsing,
through the original CPX extension. The finite block-stack driver consumes the
parsed project; it does not provide board behaviour. Ring frames and ordered
tones are compared, with positive light/sound assertions to reject empty runs.
The production browser proof separately uses the actual VM and visible CPX
pane: import, build, Start, button A and Shake must render the expected ten
red, blue and green pixels. It also checks named export refusal, unchanged
source download and the preserved original MakeCode run path.

These are qualification requirements, not a statement that a pending candidate
has passed hosted CI. All enabled final-head checks and these affected proofs
must pass before its source merge.

## First hosted comparison findings

The first hosted candidate is **not qualified**. In
[run 38897566772](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38897566772),
seven documentation comparisons pass and five fail their exact frame/tone
checks: `set-brightness#0`, `show-animation#0`, `tutorials/siren#4`,
`learnsystem/beep-beep#0` and `set-pixel-color#0`. The failed run remains the
original evidence; passing individual cases do not qualify its failed shard.

The pinned original PXT scheduler can suspend a continuation for five
milliseconds after its elapsed-time check. Its simulated NeoPixel state also
retains a reference to the supplied pixel buffer. Native CPX hats and the
extension's completed ring state have different scheduling and publication
boundaries. These source observations are relevant to the differences; they
do not establish a complete cause or timing equivalence. Button Click maps
to release in both implementations.

The next candidate corrects the census reader's nested-template handling,
the export menu control, and two browser control mistakes: waiting for the
replacement program rather than any CPX header, and selecting the visible
CPX dock rather than a hidden firmware button. It records complete comparison
differences before retaining the original strict assertions. The actual native
Start/button/Shake journey and timing boundary remain unqualified. In the
[next run](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38902268468),
source import, original simulation and native block loading pass; after Start,
the expected red ring is absent and the pane button is no longer found. A
[read-only Start diagnostic](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38905304607)
then observes that the native board does contain all ten red pixels at full
brightness while the CPX pane has unmounted. Local storage still says `cpx`;
the actual dock-change event was not captured.

The earlier serial scenario retains a user-firmware override. The global flag
intentionally restarts retained firmware, and its LabWired display can request
the Widgets dock without updating that local-storage key. This source path is
consistent with the disappearance; it is not a captured full attribution.
The next browser candidate clears only that scenario's firmware through the
existing “back to blocks” control, requiring the firmware chip to disappear
and the debugger to become idle before later device scenarios. Pixel values,
input actions and observation bounds stay unchanged. Clean native browser
qualification and the five exact timing comparisons remain pending.

A separate diagnostic observer is prepared for the five differing comparisons.
It wraps the original compiled factory, retains its exact bytes and forwards
its original yield, event, fiber, send-buffer and audio calls. These are
instrumented derivatives, identified by source/factory hashes. Observer records
use the existing collector only for these programs without serial operations;
the pinned compiler/simulator files and existing clock, snapshot and sound-reader
helpers stay unchanged.
Every derivative must reproduce every uninstrumented captured frame, ordered
tone and original serial line exactly before its trace is admitted. Individual trace records have an explicit count, digest
and completion record, so a truncated log cannot supply a complete trace. The
original native-versus-PXT assertions still run unchanged. This diagnoses a
boundary; it does not qualify timing parity or change an original failure.

## Live-share sample

On 2026-10-16, the three shares linked by the pinned documentation were still
retrievable: [kitchen example one](https://makecode.com/_F1oDHqek78qA),
[kitchen example two](https://makecode.com/_TspAH0g8gcvv) and
[beaded necklace](https://makecode.com/_MtgXgUKHhX1o). Their project metadata
identifies target versions 1.4.43, 1.4.43 and 1.4.36 respectively. All three
compile with the pinned target, infer CPX and retain named refusals for their
unsupported photon, custom-melody or external-strip operations. This sample
does not establish compatibility with newer editor APIs.
