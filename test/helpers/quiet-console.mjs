/**
 * Keep loaded code's console output OFF the test runner's transport.
 *
 * Under `node --test`, a child's console.log is written RAW to fd 1 — the
 * same pipe the runner's v8-serialized frames travel on; the parent treats
 * unframed bytes as stdout by scanning for the next frame header. A burst of
 * raw text moves the pipe's chunk boundaries, and when one lands inside a
 * two-byte header the parent resyncs on the payload's own bytes and fails the
 * file with "Unable to deserialize cloned data due to invalid or unsupported
 * version" at line 1:1 — measured 2026-09-07 on the two virtual-SPIKE e2e
 * tests, whose bundled extension logs ~1.7 KB of emoji-prefixed lines on
 * load and connect: 6 failures in 51 runs on Node 20, and twice in CI on
 * Node 22 (main run 34092576969). The writer is the extension's console;
 * the fix is to give it a console that keeps the lines.
 *
 * Usage: `const quiet = quietConsole(); … t.after(quiet.restore);` — captured
 * lines are on `quiet.lines` for an assertion that wants them.
 */
export function quietConsole (methods = ['log', 'info', 'warn', 'error', 'debug']) {
    const lines = [];
    const prior = new Map(methods.map(m => [m, console[m]]));
    for (const m of methods) console[m] = (...args) => { lines.push([m, ...args]); };
    return {lines, restore () { for (const [m, fn] of prior) console[m] = fn; }};
}
