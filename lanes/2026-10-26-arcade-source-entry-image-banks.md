# Source-entry Image-bank allocation and indexed effects

Status: DONE — source implementation and focused source controls complete in
the integration candidate; hosted runtime/editor qualification and landing pending.
Owner: Arcade integration, continuing #1128 after its current hosted intake.
Base: main `2318dd8e26ae7c41b928b4d8a537d42f929f1412`.

## Reproduce the measured boundary

Use the first exact source fixture in
`test/makecode-arcade-image-values.test.mjs`, replacing only
`image.create(2,1)` with an `img` literal containing two colour-5 pixels. Apply
its returned SVG costumes through the real `SB3Creator`, export, reimport,
apply the new costumes and export again. The current integration candidate
passes first export and reimport; the second export refuses the initialized
Array receiver for indexOf and native addition.

The emitted source allocates an Image bank before its unique startup call,
then reads `bank[(((Math.round(0)%1)+1)%1)].clone()`. The existing reset-effect
proof only allocates Arrays inside startup, and its indexed element carries a
conservative stored-value effect. Neither an Image[] annotation nor an asset
name establishes a real initialized producer or an Image element.

## Exact implementation scope

- `overlay/scratch-gui/src/lib/bw-makecode/array-source-start-reset-effects.js`:
  model bounded real source-entry bank allocations and their ordered elements
  through the unique closed startup call. Track allocation identity, every
  writer and original evaluation. A proved in-bounds index may transport the
  selected element's private effect domain to clone; never expose a public
  Image, Array or initialization certificate from this effect theorem.
- `array-reference-export-authority.js`: only necessary private operand-effect
  plumbing and consumption of the independently proved unreachable reset. Keep
  actual producer, all-writer, element and occurrence-readiness checks separate.
- Focused source-entry bank tests, the existing
  `test/arcade-image-addition-export.test.mjs`, any exact GUI dependency row,
  this claim and the existing Arcade handoff.

An exact index proof must derive round/arithmetic from actual literal operands
and preserve their order. A domain-only Number is not a concrete index.
Unknown, nonfinite, fractional, negative or out-of-bounds indices, empty banks
and unknown elements refuse. Source-entry mutation, aliases, competing entries,
read-before-allocation, conditional or missing overwrite, opaque calls,
registration, recursion, capture and prototype/source changes retain their
existing refusals. Preserve used-only sticky lifetime and final callback checks.

No other producer helpers, reset helpers, runtime algorithms, SDKs, suppliers,
pins, workflows, assertions, baselines or budget changes. If another producer
boundary is required, diagnose and claim it separately before implementation.
Keep private inputs and operational receipts out of outgoing files.

## Qualification and completion

Preserve the factory-based and Array-free Image controls and all existing
source-start/frame/reset negatives. Add direct and JSON second-export controls
for the unchanged costume variant, separate allocation/order/all-writer and
index/element negatives, callback mutation and sticky mutation/restore cases.
Use independent guard cuts for entry availability, exact index and actual Image
element provenance. Keep original source-analysis limits.

Qualify actual original/native Image values, alias/clone pixels and fresh SB3
reopen on the final combined hosted head. Visible Blocks, Code, costume pixel
editing and controller-driven mutation remain a separate required editor
journey. Source acceptance alone does not complete an application or change the
corpus count. Do not duplicate the predecessor's numeric intake or hosted runs;
publish a successor only after its terminal intake. Merge only all enabled
exact-head checks successful with reviewed tree and parents verified.
