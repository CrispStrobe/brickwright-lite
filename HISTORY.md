# Brickwright history

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

## Operational lessons retained as rules

- Work occurs in separate worktrees and feature branches because shared
  checkouts caused lost and duplicated work.
- Producer changes land upstream before vendored pins move.
- Overlay and tracked generated mirrors move together.
- Remote artifact identity is established from content, not timing or branch
  names.
- Structural, browser, package, and mutation gates are used where text search or
  isolated unit tests cannot observe the failure.
