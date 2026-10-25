# Arcade managed SDK ownership

## Purpose and status

This contract coordinates compatibility between existing native SDK Sprite
construction and updates, managed procedure exceptions and synchronous nested
VM execution. Implementation starts only after this claim merges normally.
Source review identifies three distinct ownership mismatches; it does not
qualify a fix or establish that every similar diagnostic has the same cause.
Keep original failures and unresolved observations visible.

The boundary extends the existing
[exception handoff](compatibility/arcade-throw-statements.md) and coordinates with
[owned Sprite callbacks](compatibility/arcade-owned-sprite-class-callables.md).
It does not turn the physical owned Sprite factory into a general inheritance
capability or admit arbitrary host-created activations.

## Three separate mechanisms

### Constructor and virtual-call continuation

Preserve the genuine private caller lease captured by an actual class
construction through SDK dispatch, overridden methods and their asynchronous
continuations. Bind it to the same runtime, owner, caller frame, target and block
container, generation, object construction and actual method entry. A public
argument, copied utility, object tag or construction token alone cannot issue
this authority. Check currentness before effects and after awaited boundaries;
Stop, project replacement, cancellation and disposal invalidate pending work.
Release retained resources and settle each owned continuation exactly once on
normal completion, cancellation or exceptional completion.

Do not remove the managed-call active-caller requirement. Extend its existing
private retained-caller path only for the actual qualified construction chain.
Keep method arguments, defaults, receiver, return values and procedure parameter
constraints unchanged. A retained constructor lease cannot authorize an
unrelated callback or survive into a later construction.

### Existing physical Sprite update activation

An actual scene-driven user update starts from an existing physical update
entry, rather than an invented managed caller thread. Bind its exception
activation to that exact privately issued, current, unused scene/phase entry,
actual member, target, definition, generation and newly spawned child. Consume
it once, before effects, through coordination with the existing update-entry
owner. Do not grant authority by reading mutable public phase fields.

Maintain the distinction between a root activation and a managed parent edge.
Do not manufacture a parent, globally allow a missing caller or add a general
host root-loan API. Arbitrary direct calls, stale or foreign entries, changed
scene membership, wrong definitions and reused entry receipts must refuse.
An actual update failure retires its own affected managed lineage and settles
its waiters exceptionally; unrelated detached fibers retain their existing
semantics. Preserve the inherited SDK no-op path and actual phase ordering.

### Synchronous nested creation callbacks

A genuine nested VM child may temporarily suspend the exact current primitive
execution loan. Bind the handoff to the actual caller, arguments, utility,
operation/cache, live child and target. Restore shared utility, active thread
and loan ownership on return or throw. Each child owns its own record; neither
reentry flags nor copied arguments grant permission.

Use this handoff only while that synchronous loan is actually live. An
asynchronous construction continuation must use its retained activation and
normal queue ownership; it cannot borrow an earlier primitive loan. Preserve
created-handler registration order, captures, earlier effects, pause behavior
and exception propagation. Do not broadly admit terrain, destroyed or other
event families without their actual corresponding ownership proof.

## Metadata probes and independent Buffer owners

A metadata-only probe that creates a second Arcade instance on an already
owned runtime is distinct from a real second service owner. The probe may read
the genuine existing instance metadata, or use a separately justified passive
metadata route, without replacing runtime exception authority. Preserve all
opcode, image mutation, collision and renderer lifetime assertions.

The existing two-owner Buffer isolation control intentionally uses one runtime.
Do not change it to two runtimes to avoid the ownership question. If supporting
passive service instances is necessary, separate per-instance Buffer heap
ownership from the unique registered exception executor. Preserve foreign-ID
refusal and actual registration/cache/instance/lifecycle binding. A second
instance must not replace, borrow or dispose another instance's exception
execution authority. Removing runtime owner uniqueness alone is insufficient.
Keep this compatibility boundary explicit if a proper implementation remains
unresolved.

## Owned files and coordination

Own only the changes necessary for these mechanisms in:

- `overlay/scratch-vm/src/util/bw-arcade-exceptions.js` and
  `overlay/scratch-vm/src/util/bw-primitive-owner.js`;
- `overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js`,
  `sdk-object-classes.js`, `sdk-sprite-classes.js`,
  `sprite-update-activation.js` and `frame-phase.js` in that same directory;
- focused controls in `test/makecode-arcade-sdk-sprite-class.test.mjs`,
  `test/makecode-arcade-extendable-update.test.mjs`,
  `test/makecode-arcade-extendable-export-original.test.mjs`,
  `test/nested-execute-context.test.mjs`,
  `test/makecode-arcade-image-mutation.test.mjs` and
  `test/makecode-arcade-buffer-lifetime.test.mjs`, plus narrowly named new
  ownership controls and the necessary metadata probe in
  `test/helpers/bw-extensions.mjs`;
- this contract, `LANES.md` and affected compatibility status documentation.

Coordinate the shared exception and primitive utilities with their existing
Throw, Array, condition-wait, current Number-input, scene-clock and null Sprite
getter owners before editing. Preserve genuine registration, cached operation,
method and instance identity proofs and all other role tables. Follow the
normal integration policy for an owned mirror if required; no independent
mirror-only behavior or private module alias is permitted. Any wider engine,
loader, scheduler, callable, image or service API change requires a separately
reviewed envelope before implementation.

No dependency or supplier pin, canonical word, reference/value domain, SDK
class surface, default rule, callback family, coercion, runtime timing or
exception syntax expansion is authorized. Do not weaken diagnostics,
assertions, time limits, baselines or ownership checks to admit these cases.

## Acceptance

Retain full actual source, diagnostics, native errors, relevant actor and cell
state, frames, captures, continuation outcomes, input assets and cleanup
observations before assertions. A swallowed error, empty metadata result,
Undefined return, timeout or successful child retirement does not prove the
intended program completed.

Qualify the actual constructor and image pause controls, physical update and
lifecycle controls, nested Sprite-created callbacks and SDK subclass Stop and
restart. Preserve real receiver/field results, callback order, earlier effects
and absence of stale later effects. Verify current Code, same and fresh saved
projects, edited export and reimport where affected; use current graph and
assets rather than restoring original source.

Add nonvacuous negatives for wrong or reused leases, changed caller frame or
method, forged/copy arguments, unrelated child, missing caller, reused update
entry, foreign scene, Stop/reload, failed child cleanup and late continuations.
A caller-less arbitrary host invocation must still refuse while a genuine
physical update succeeds. Positive nested callbacks must require the private
handoff; removing restoration must fail the control. Keep an unrelated detached
fiber as a control for lineage isolation. Retain both own-ID positives and
cross-owner Buffer-ID negatives on the same runtime.

Before merging implementation, require affected clean native own-guest
qualification and independent saved-output review as well as source controls
and all enabled exact-head CI checks. New selected-original executions need
their own complete source/resource admission; existing originals are retained
without replay merely to read them. Hosted visible GUI and full dependency or
MakeCode compatibility remain separate gates. No hardware, physical timing,
whole-game or corpus-count promotion follows from this bounded ownership work.

## Coordinated source update Throw boundary

The runtime entry contract alone does not admit class/update Throw source. The
[bounded source amendment](ARCADE-EXTENDABLE-THROW-SOURCE-ADMISSION.md) coordinates
actual structural method ownership, earliest entry initialization and fresh
normalization proof before the existing runtime entry can execute that source.

## Physical-frame exceptional iterator completion

The physical frame's internal terrain generator must receive a rejected yielded
operation through that same iterator's `throw`, preserving the original rejection
and delegated `finally` blocks. An abandoned iterator cannot retain a current
Sprite-update entry. Preserve the existing successful `next()` contract, including
its absence of a forwarded fulfillment value. Do not bypass scene reentry checks,
retire unrelated input fibers or suppress updates during partial construction.

Cancellation closes the existing internal iterator with return completion;
yielded cleanup continues only within that completion, without resuming its
ordinary body. The current physical Sprite cleanup performs registry deletion
without yielding. The defensive limit of 64 cleanup steps applies only to these
framework iterators; exhaustion rejects explicitly and cannot qualify successful
cleanup or authorize a new ordinary continuation. This is not a public guest
iterator API, a new timing policy or a guarantee that an arbitrary external
Promise completes. Real bounded controls must retain cleanup failures and limits.

A duplicate frame diagnostic may be suppressed only by the same runtime's
private issued signal and a successful original diagnostic publication. A copied
message, foreign runtime or unpublished signal is insufficient. Stale frame
feedback must not enter a new epoch; current unrelated errors keep their normal
diagnostic path. The private publication query grants no activation or parent
lease. Qualification still requires the unchanged complete image-pause and
throwing-update guests on a fresh normal production installation, with earlier
effects, independent input progress, future updates and Stop preserved.
