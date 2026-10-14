/**
 * The Yosys worker. Glue only — every decision is in worker-protocol.js, which
 * is where the tests can reach it without a Worker (and where the comment
 * explaining that split lives).
 *
 * The one thing that IS decided here: which Yosys. `@yowasp/yosys` is imported
 * at the top of the worker rather than lazily, because the worker is only ever
 * spawned by a user who has already consented to the download — so there is
 * nothing to defer, and a dynamic import inside the handler would only move the
 * 78 MB to a less predictable moment.
 */
import {runYosys} from '@yowasp/yosys';
import {handleMessage} from './worker-protocol.js';

const session = {toolchain: null};

self.onmessage = async event => {
    const out = await handleMessage(event.data, session, {
        runYosys,
        postProgress: m => self.postMessage(m)
    });
    // null means the message carried no id, so there is nobody to answer.
    if (out) self.postMessage(out);
};
