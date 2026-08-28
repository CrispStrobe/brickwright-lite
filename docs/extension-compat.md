# Extension compatibility — Xcratch *and* TurboWarp

Goal: load (at least a useful subset of) both extension formats, on a permissive base,
with everything **bundled** (no remote URL loading required).

## The three shapes

| Format | Registration | Block metadata |
|---|---|---|
| **Built-in** (vanilla Scratch) | class registered in scratch-vm `extension-support/extension-manager.js` `builtinExtensions`; `new Ext(runtime)` | `getInfo()`; `BlockType`/`ArgumentType` imported |
| **TurboWarp unsandboxed** | `Scratch.extensions.register(new Ext())` at module top; API injected as global `Scratch` | `getInfo()`; `Scratch.BlockType` / `Scratch.ArgumentType` |
| **Xcratch module** | module exports `{ blockClass, entry }`; `entry` carries id/name/iconURL; registered by Xcratch's loader | `blockClass.getInfo()` |

They all converge on the same core: **a class with `getInfo()` returning blocks, and methods
named by opcode.** Only the *registration wrapper* and the *API surface* differ.

## Plan: one permissive shim, three adapters

Write a small MIT `loadBundledExtension(mod, runtime)` that:

1. **Provides the `Scratch` global** (`BlockType`, `ArgumentType`, `Cast`, `TargetType`,
   `translate`, and `extensions.register(inst => …)`) so a TurboWarp-unsandboxed module
   *self-registers* into our manager instead of TurboWarp's MPL runner. (This is a clean-room
   re-impl of the ~30-line register surface — not TurboWarp's code.)
2. **Detects Xcratch shape** (`mod.blockClass` + `mod.entry`) and registers `blockClass`,
   carrying `entry` metadata (icon, name).
3. **Detects a built-in class** (default export / `new mod(runtime)`).

All three end at `extensionManager._registerInternalExtension(instance)` (BSD scratch-vm API).
`getInfo()` is identical across formats, so blocks Just Work. CrispStrobe's extensions came
from Xcratch originally and were ported to the TurboWarp API, so both adapters cover them.

## Runtime-value coercion

TurboWarp/Xcratch extensions call `Scratch.Cast.*`. Provide a minimal permissive `Cast`
(toNumber/toString/toBoolean/compare/toListIndex) — the same shim already used headlessly in
sb3-creator's `scripts/gen-runtime-registry.mjs` and `test/vm.test.mjs`.

## Remote loading

Exact content-pinned gallery sources use the in-process compatibility adapter
above. Every unpinned URL instead receives a deliberately smaller `Scratch`
surface in a VM worker: metadata enums, `Cast`, translation, `fetch`, and
`extensions.register`, with `unsandboxed: false`. HTTP(S) fetch/import remains
available, while WebSockets and nested workers are blocked so code cannot dial
the app's native loopback Scratch-Link service or create a fresh realm which
can. WorkerNavigator Bluetooth, serial, USB and HID entry points are removed as
well. The central dispatcher accepts
only that worker's registration lifecycle, so raw `postMessage` cannot be used
to reach editor or native-facing services.

This supports sandbox-compatible Scratch/TurboWarp extensions. An extension
which requires unsandboxed page access is intentionally incompatible with the
unpinned URL path; it must be reviewed and shipped as pinned or bundled code.
