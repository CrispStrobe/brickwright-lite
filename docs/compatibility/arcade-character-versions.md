# Character animation source versions

BrickWright's default character-animation host uses MakeCode's `v0.1.0` API.
The older `v0.0.2` source has a separate host and version selection. Its immutable
source is [Microsoft commit a8df7de6](https://github.com/microsoft/arcade-character-animations/tree/a8df7de6f7073b553976b9e47fbfadebcdc4f0ec),
retained with its MIT notice in
`overlay/scratch-vm/src/extensions/crispstrobe/arcade/legacy-character-source/`.

## Admission and conversion

`native-source-admission.js` admits only the byte-identical retained `main.ts`
under the matching package ID and filename. The receipt identifies the original
source hash and native library revision. Dependency preparation preserves every
additional executable package file and its ordering. Modified library source is
not admitted by a package name, version tag or provenance claim.

The old namespace initializes constants and class/function definitions. Its scene
stack and callbacks are lazy. The native host runs the complete original module;
it does not substitute simplified animation rules or skip active initializers.

Import selects the old host for prepared exact-source admission, or a main
program explicitly requesting the known old tag/revision. The selection is
written before green-flag operations. Export requires a fixed version selector
at the start of a green-flag script and uses the immutable old dependency revision.
Dynamic, late and duplicate selections are diagnosed.

The old source supports `loopFrames`, `runFrames`, character state and enabled
controls, `matchesRule`, `rule`, `ruleToString`, `_predicate` and `_animationFrames`.
Its fifth rule predicate is ignored by the original implementation and remains
ignored. `setController`, `lockFacingDirection`, `unlockFacingDirection` and
`_direction` belong to the newer API and are diagnosed when importing the old
version; newer controller/facing blocks are also refused on old-version export.
The native version selector refuses changing versions after first use.

## Verification and remaining boundaries

Run the focused tests with the repository's normal test dependency setup:

```
node --import ./scripts/lib/register-gui-scope.mjs --test \
  test/makecode-arcade-legacy-character-roundtrip.test.mjs \
  test/makecode-arcade-legacy-character-host.test.mjs \
  test/makecode-arcade-character-animations.test.mjs
```

The roundtrip fixture compares unchanged original PXT compilation/simulation
against native execution, Code decompilation, saved SB3 loading into both the
same and a fresh VM, exported original PXT execution, and reimported execution.
It checks the fifth predicate, rule descriptions including a negative fractional
input, manual state matching, and an additional package initializer. Separate
host tests exercise scene lifecycle, frame timing, rendering and destroyed-sprite
cleanup. These finite tests do not qualify an entire imported corpus project,
all numeric inputs, or a full editor/controller journey. The corpus partial
counts remain separate acceptance records.
