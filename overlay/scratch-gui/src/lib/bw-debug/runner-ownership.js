/**
 * Which debug runner the panel currently owns.
 *
 * The panel replaces its runner whenever new media arrives (an assembled ROM,
 * a machine image, a firmware file). The runner being replaced may still be
 * inside an async attach — the default Z80 bench, for instance, is awaiting
 * its BBC BASIC fetch — and when that await resolves it publishes
 * `attaching`/`ready` through the onChange callback it was created with.
 * Before this guard the panel applied that late snapshot on top of the
 * replacement's `running`: the phase read `ready` for good, Pause stayed
 * disabled although the new machine ran, and the debug-history browser gate
 * timed out clicking it (intermittently, because it depends on whether the
 * old fetch finishes after the new attach).
 *
 * A runner's notifications count only while its claim is current. Tearing a
 * runner down releases the claim, and starting a new one supersedes it.
 */
export function createRunnerOwnership () {
    let current = null;
    return {
        /** A new runner is being created; earlier claims stop counting. */
        claim () {
            current = {};
            return current;
        },
        /** The current runner was torn down; no claim counts until the next. */
        release () {
            current = null;
        },
        isCurrent (claim) {
            return claim !== null && claim !== undefined && claim === current;
        },
        /** Wrap a callback so it runs only while `claim` is current. */
        guard (claim, fn) {
            return (...args) => (claim === current ? fn(...args) : undefined);
        }
    };
}
