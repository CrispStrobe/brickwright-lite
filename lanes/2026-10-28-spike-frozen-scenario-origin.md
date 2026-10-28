# SPIKE frozen profile: anchor scenario paths to the package

Status: CLAIMED — operator-requested fix for the slow first emulated second.
Owner: Claude, operator-authorized.

Hosted timing (renode-spike-prime macOS timing workflow) shows the frozen
NuttX resource profile needs 534–1229 s of wall time for the first emulated
second on every macOS runner, the unfrozen producer package 7–14 s. The
frozen scenario names `@platforms/boards/spike-prime.repl` relative; Renode
then resolves it against its own bundled, unstaged platform files, not the
package's staged copy (aggregate display clock, no network SVD).

Scope: `scripts/lib/spike-resource-profile.mjs` portable scenario templates
(anchor to the scenario's own directory), its focused tests, and
`docs/SPIKE-MACOS.md`. Linux packages use the same profile, so the change is
qualified with a hosted boot timing on Linux and macOS before merge. No
firmware, Runtime, pin, model or workflow change in this repository.
