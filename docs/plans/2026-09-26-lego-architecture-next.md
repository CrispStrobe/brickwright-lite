# LEGO architecture: plan to close the remaining gaps

Status date: 2026-09-26. This plan is derived from executable code and tests, not from the
August architecture snapshot. Each phase gets its own merged `LANES.md` claim before code.

## Definition of complete

Gap 1 is complete when every supported non-deferred LEGO family has an executable census of
its shipped block surface and a bidirectional BrickWright mapping for every portable learner
operation, with exclusions carrying reasons. Gap 2 is complete when NXC and the two Python
hub APIs have first-class editor language/service support. Gap 3 is complete when SPIKE,
EV3, NXT and the LPF2 family can run their bundled extensions against deterministic virtual
hub state with program→actuator and UI/world→sensor paths, plus actuator feedback.

RCX remains the explicit exception: its useful direct NQC path is complete, while default
simulation cannot ship the proprietary ROM/firmware.

## Phase 1 — make the contract truthful, then finish SPIKE

1. Refresh sb3-creator's canonical SPIKE source from the shipped consolidated extension.
   Reconcile the current 84-opcode compiler census with the 101-opcode shipped surface.
2. Map the remaining portable learner operations. Keep deployment/file/REPL controls and
   event hats excluded until their semantics are representable without changing behavior.
3. Add deterministic `advance(ms)` motor-position integration to the virtual SPIKE state;
   prove speed→position→extension reporter feedback without wall-clock sleeps.
4. Define the minimal protocol-neutral descriptor/state contract by extracting only what a
   second implementation actually needs. Do not prematurely merge protocol codecs.

## Phase 2 — EV3 as the second-family proof

1. Generate an EV3 portable-block census from `ev3comprehensive.getInfo()` and implement the
   BrickWright forward/reverse map upstream in sb3-creator.
2. Add a virtual EV3 direct-command adapter backed by the shared state contract. Cover motor
   position, touch, color, ultrasonic, buttons, display and sound state.
3. Run the bundled `ev3comprehensive` extension unchanged against that adapter. A scripted
   motor→sensor→display journey must pass without physical hardware.
4. Keep ev3dev separate: share descriptors where truthful, not transport or firmware claims.

## Phase 3 — NXT and the LPF2 family

1. Add NXT census/map and a deterministic virtual transport around its existing extension.
2. Model Boost, WeDo 2.0 and Powered Up from one LPF2 descriptor/state core with separate
   extension-facing adapters. Prove shared behavior once and each public surface separately.
3. Add family-level conformance tests: equivalent motor/sensor verbs produce equivalent
   state transitions while family-specific capabilities remain explicit.

## Phase 4 — editor gap

1. Add an NXC CodeMirror language mode with syntax highlighting, comments, strings and
   balanced-brace indentation; wire `.nxc` import/export and parser refusal tests.
2. Add data-driven SPIKE Python and ev3dev2 API completion/signature help on top of the
   existing Python editor. Generate API symbols from the same descriptors used above.
3. Do not create a text editor for LMS bytecode; expose it as an inspectable/downloadable
   binary artifact instead.

## Landing and proof order

Owning-repository changes land first (`CrispStrobe/extensions` or sb3-creator), followed by
an exact Lite pin and regenerated evidence. Each phase must include a positive E2E journey,
a negative/refusal case, and a mutation that proves its census or adapter can fail. A gap is
not marked closed from source inspection alone.
