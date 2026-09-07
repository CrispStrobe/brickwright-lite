# Brickwright history

- Added the neutral brick-state runtime connector with bounded command
  correlation and deterministic disconnect/reconnect generation handling.

This is a compact ledger of durable capabilities and decisions. Git remains the
source for commit-level detail. Current tasks belong in [PLAN.md](PLAN.md).

## Foundation

- The product is based on the last compatible permissively licensed Scratch
  stack and applies owned overlays to pinned upstream sources.
- CI validates source pins, generated mirrors, third-party notices, project
  bundles, service-worker behavior, and browser-visible integration paths.
- The web and Tauri applications share the built editor; native privileges are
  mediated by a packaged broker rather than exposed to page code.

## Authoring and learning

- Blocks, Brickwright Code, Python, JavaScript, C, BASIC, and assembly surfaces
  exist with explicit conversion boundaries.
- Guided lessons, starter journeys, bilingual user-facing content, instruments,
  circuit examples, and recovery paths are part of the shipped workbench.
- MakeCode micro:bit and Arcade artifacts import embedded source; unsupported
  conversions are counted and surfaced.

## Machines and circuits

- Instruction-level targets include 8051, AVR, RP2040, 6502, Z80, and an 8086
  tier, each with target-specific debugger capabilities.
- Circuit editing, modified-nodal-analysis simulation, device faces, generated
  schematics, DRC, autosave, undo/redo, and project-bundle checks are integrated.
- External GPL tools are used only as developer-side differential oracles; they
  are not shipped or linked into the product.

## LEGO

- The repository contains permissively licensed LEGO-family extensions and
  distinct adapters for BLE, Bluetooth Classic, and bridge transports.
- A deterministic virtual SPIKE dashboard shares neutral hub state across
  protocol adapters and distinguishes LEGO v2, LEGO v3, Pybricks, and
  Brickwright firmware targets.
- The measured SPIKE authoring slice produces a real `.sb3`, reverses through
  the code representation, and executes representative motor, sensor, display,
  and stop operations.
- Firmware and TI controller binaries are not distributed. Public tests use
  synthetic fixtures; unchanged proprietary or mixed-license images are local
  developer inputs.
- A versioned, bounded NDJSON adapter now validates immutable Renode snapshots,
  rejects replay and unannounced gaps, and maps the complete neutral state into
  `VirtualSpikeHubState`. Its fixtures are pinned byte-for-byte to the Renode
  producer contract.
- The neutral state connector now has an opt-in host-only loopback TCP factory.
  Fragmented snapshots, correlated command results, explicit reconnect, and
  bounded write backpressure pass through the production connector in an
  end-to-end source-only test; no browser bundle or automatic connection is
  introduced.

## Operational lessons retained as rules

- Work occurs in separate worktrees and feature branches because shared
  checkouts caused lost and duplicated work.
- Producer changes land upstream before vendored pins move.
- Overlay and tracked generated mirrors move together.
- Remote artifact identity is established from content, not timing or branch
  names.
- Structural, browser, package, and mutation gates are used where text search or
  isolated unit tests cannot observe the failure.
