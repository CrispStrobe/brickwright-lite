#!/usr/bin/env node
/**
 * Time every bounded Playwright wait in one sweep, so 79 unmeasured timeouts
 * become 79 measured ones without probing any of them individually.
 *
 * WHY NOT PROBE THEM ONE AT A TIME
 * --------------------------------
 * `scripts/threshold-probe.mjs` (sb3-creator) binary-searches a threshold's flip
 * point, which is the right instrument for a floor over a corpus: cheap, exact,
 * and the flip point IS the measurement. It is the wrong instrument for a
 * browser wait. Each probe needs a built editor, a browser and a full page load,
 * so bisecting 79 of them is ~600 browser runs to learn something one run
 * already contains: **how long the thing actually took.**
 *
 * A bound's evidence is the observed duration under it. Collect that for every
 * wait in a single sweep and every literal in the sweep gets a number.
 *
 * WHAT IT MEASURES, AND WHAT THAT IS WORTH
 * ----------------------------------------
 * For each call site: n, p50, p90, max observed milliseconds, and the literal
 * the call passed. `headroom = literal / p90` says how much slack the number has
 * over what this box actually needed.
 *
 * It is ONE box under whatever load it had. A p90 is evidence about that; it is
 * not a claim about a GitHub runner, and the sweep records load and CPU/wall
 * ratio alongside so a reader can tell a slow box from a slow app. That is the
 * same discrimination the timeout discriminator makes in CI, for the same
 * reason: an unqualified duration is a number about the wrong thing.
 *
 * WHAT IT CANNOT MEASURE, STATED BECAUSE IT IS THE LARGER POPULATION
 * ------------------------------------------------------------------
 * `page.waitForTimeout(N)` is a FIXED SLEEP, not a bound. Its observed cost is
 * always exactly N, so timing it yields the literal back and learns nothing.
 * There are ~181 of those in these scripts — more than twice the bounds — and
 * they are counted and reported separately rather than given a fake p90.
 *
 * HOW IT ATTACHES
 * ---------------
 * A module-resolution hook redirects `playwright` to a wrapper, so no call site
 * changes. The wrapper proxies Browser/Page/Locator, times every awaited method
 * and attributes it to the CALLER's file:line, which is the same key the
 * threshold inventory uses. Nothing is edited; a run without
 * `--import ./scripts/observe-timeouts.mjs` behaves exactly as before.
 *
 *   node --import ./scripts/observe-timeouts.mjs scripts/verify-editor.mjs
 *   OBSERVE_OUT=/tmp/obs.jsonl PROOF_URL=http://localhost:8617/ node --import …
 *
 * THE INSTRUMENT ASSERTS ITS OWN YIELD. A hook that fails to install produces an
 * empty file, and an empty file is what a broken instrument and a clean sweep
 * look like alike. Every run writes an `installed` marker record first, and
 * `aggregate-timeouts.mjs` refuses to report on a file that has none.
 */
import {register} from 'node:module';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const OUT = process.env.OBSERVE_OUT || '/tmp/observe-timeouts.jsonl';

register('./observe-timeouts-hook.mjs', import.meta.url);

// The marker. Written at install time, before any browser exists, so its
// absence means the hook never ran — distinguishable from "the sweep observed
// nothing", which is a different and much rarer fact.
appendFileSync(OUT, JSON.stringify({
    type: 'installed',
    argv: process.argv.slice(1),
    out: OUT,
    node: process.version,
    startedAt: new Date().toISOString()
}) + '\n');

// The wrapper writes through this global rather than importing this file again:
// the hook has already redirected `playwright`, and a second module instance
// would keep its own buffer and write nothing.
globalThis.__observeTimeouts = {
    out: OUT,
    root: process.cwd(),
    rootURL: pathToFileURL(process.cwd() + '/').href,
    record (rec) {
        try { appendFileSync(OUT, JSON.stringify(rec) + '\n'); } catch { /* never fail a sweep over telemetry */ }
    }
};
