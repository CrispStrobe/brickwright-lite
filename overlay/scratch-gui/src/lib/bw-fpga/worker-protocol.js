/**
 * The messages between the page and the Yosys worker, as a pure function.
 *
 * WHY A WORKER AT ALL. Compiling 78 MB of WebAssembly and then running it takes
 * seconds (§8e measured 3.9 s for a design with one wire in it), and on the main
 * thread that is a frozen editor — including the progress bar meant to show the
 * download, which is the one moment the user most needs the page to be alive.
 *
 * WHY THE PROTOCOL IS A PURE FUNCTION AND THE WORKER IS FIFTEEN LINES. Nothing
 * in this repository EXECUTES the worker: it is behind BW_ENABLE_FPGA like the
 * rest of the surface, and `scripts/check-flagged-jsx.mjs` parses without
 * executing. (Note the verb. webpack RESOLVES these modules even with the flag
 * off — DefinePlugin drops the code after the graph is built — which is how a
 * default build went red on a missing @yowasp/yosys; see yosys-absent.js.) bw-synth learned the same lesson in Python and split
 * `handle_synth(raw_body, *, run=None)` out of its transport for it. So the
 * decisions live here, where a test can reach them without a Worker, and
 * yosys-worker.js is glue thin enough to read in one go.
 *
 * WHAT IT REFUSES, and these are the cases a Worker makes easy to get wrong:
 *   - a message with no `id`, which would produce a reply nobody can match
 *   - an unknown `type`, rather than silently doing nothing and hanging the page
 *   - work before `init`, rather than a confusing failure inside Yosys
 *
 * UNSOLICITED PROGRESS IS `progress`, AND AN ANSWER IS NEVER `progress`. Both
 * carry the same payload, so the first version of this used `state` for both —
 * and the client, which ignores unsolicited messages by type, then ignored the
 * reply to `describe` and left that promise pending forever. A message's type
 * has to say whether it ANSWERS something, not just what it is about.
 *
 * @module
 */

import {createLocalToolchain} from './local-toolchain.js';

export const PROTOCOL_VERSION = 1;

const reply = (id, body) => ({protocol: PROTOCOL_VERSION, id, ...body});

/**
 * Handle one message. `session` is the worker's own mutable state — passed in
 * rather than held in a module variable so a test can run two independent
 * sessions, and so nothing here depends on being a module nobody reloads.
 *
 * @param {object} msg      {id, type, ...}
 * @param {object} session  {toolchain: object|null}
 * @param {object} deps     {runYosys, capabilities, postProgress}
 */
export async function handleMessage (msg, session, {runYosys, capabilities = null,
    postProgress = null} = {}) {
    if (!msg || typeof msg !== 'object' || msg.id === undefined || msg.id === null) {
        // No id means no way to answer. Returning a reply with a made-up id
        // would be worse than none: the page would resolve the wrong promise.
        return null;
    }
    const {id, type} = msg;

    if (type === 'init') {
        // A `progress` push carries describe()'s OWN object, the same shape the
        // reply to `describe` carries, so a caller has one thing to render and
        // not two that drift. That needs the toolchain to call describe() on
        // itself, hence the deferred reference rather than spreading the raw
        // state object — which was a second, thinner shape wearing the same name.
        let tc = null;
        tc = createLocalToolchain({
            runYosys, capabilities,
            onState: postProgress
                ? () => postProgress({protocol: PROTOCOL_VERSION, id,
                    type: 'progress', state: tc.describe()})
                : null});
        session.toolchain = tc;
        return reply(id, {type: 'ready', state: tc.describe()});
    }

    if (!session.toolchain) {
        return reply(id, {type: 'error', ok: false, code: 'not-initialised',
            reason: 'The worker was asked to work before `init`. That is a bug in the '
                + 'caller, not a condition the user can fix.'});
    }

    if (type === 'describe') {
        return reply(id, {type: 'state', state: session.toolchain.describe()});
    }
    if (type === 'download') {
        return reply(id, {type: 'download', result: await session.toolchain.download(
            {consent: msg.consent === true})});
    }
    if (type === 'synthesise') {
        return reply(id, {type: 'synthesise', result: await session.toolchain.synthesise(
            {files: msg.files, top: msg.top ?? null})});
    }

    return reply(id, {type: 'error', ok: false, code: 'unknown-message',
        reason: `The worker does not understand "${type}". Answering is deliberate: a `
            + 'worker that ignores a message leaves the page waiting forever.'});
}
