## iOS audit controls: explicit Cargo selection — 2026-10-19

The active-asset candidate's hosted unit shard found two new ambient-binding
sites in `test/tauri-embedded-asset-audit.test.mjs`: both compiler calls selected
Cargo by bare PATH lookup. The controls now require the Cargo installation's
absolute executable path, from absolute `CARGO_HOME` or the standard home Cargo
installation, preserving the proxy basename and toolchain selection. Missing or
relative installations refuse; there is no PATH fallback. This binds tool selection
without pinning its version or proving which compiler built an installed app.

The gate-shape baseline and detector are unchanged. Its 11 controls pass, with
ambient findings restored from 11 to the existing allowance of 9. All three Rust
control tests pass, including the 12 collector methods and three semantic mutations,
with a decoy Cargo first on PATH that is never invoked. Explicit missing-tool and
relative-root negative runs fail as required. Original hosted failure metadata and
log are retained privately. No workflow, native code, dependency pin, compiler
threshold, mutation assertion or actual-app qualification changes in this repair.
Launch-environment binding and Darwin monitoring remain the next implementation
work; the active-asset source candidate stays draft pending its actual qualification.
