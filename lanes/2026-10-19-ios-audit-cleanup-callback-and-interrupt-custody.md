## iOS audit: cleanup callback and interrupt custody — 2026-10-19

The unwired transaction core now accepts a separately admitted cleanup callback,
so an active adapter's sticky Stop refusal cannot also block cleanup catalogs,
terminate, shutdown or delete. Default callback behavior remains available for
existing source controls. Identity readback, command counts and cleanup deadlines
still apply to the cleanup route; this callback grants no ownership authority.

Interrupts during an owned cleanup command are deferred until later cleanup and
receiver release have been attempted. The first interrupt survives subsequent
cleanup interrupts; private immutable result/retained-observation snapshots remain
attached to it. Broken cleanup-clock admission refuses further command dispatch.
Thirty-three authored lifecycle cases and routing/continuation mutations pass;
normal behavior and prior failures remain covered. No workflow entry invokes the
core, no simulator/app event ran and callback/resource admission remains false.
