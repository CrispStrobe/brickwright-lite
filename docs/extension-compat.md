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

## Not needed now

The unsandboxed *URL loader* + security-manager (TurboWarp MPL/GPL) — we bundle, so skip it.
If remote loading is wanted later, add it permissively (or as a separate, clearly-licensed layer).
