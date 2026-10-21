// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The virtual SPIKE Prime's firmware 2.x REPL as a plain byte stream: a peripheral record
// ({id, name, available(), open(link) => {receive, close}}) that a stream transport (the WebSocket
// bridge, virtual-bridge.js 'text' framing) can carry.
//
// The 2.x simulation already exists, behind Scratch Link's Bluetooth Classic JSON-RPC
// (lib/virtual-hub/spike-classic-scratch-link.js VirtualSpikeClassicSocket: the REPL lines, the
// JSON-RPC command replies, the streamed port report). This record does not reimplement any of it: it
// opens one of those sockets, connects it as Scratch Link would, and unwraps it — bytes in become its
// `send` (base64), its `didReceiveMessage` (base64) become bytes out. So a hub reached over the bridge
// is the same simulated hub, speaking the same text, as over Scratch Link BT.

import {VirtualSpikeClassicSocket, encodeBase64, decodeBase64} from '../../virtual-hub/spike-classic-scratch-link.js';

export const SPIKE_STREAM_PERIPHERAL_ID = 'brickwright-virtual-spike-stream';

/** Scratch Link's BT endpoint, as the socket expects to have been dialled. */
const CLASSIC_URL = 'ws://127.0.0.1:20111/scratch/bt';

/**
 * @param {object|(() => object|null)} hubState the VirtualSpikeHubState (or a getter), on the
 *   'legacy-v2' firmware target as a 2.x hub
 */
export const spikeStreamPeripheral = hubState => {
    const getHub = typeof hubState === 'function' ? hubState : () => hubState;
    return Object.freeze({
        id: SPIKE_STREAM_PERIPHERAL_ID,
        name: 'Virtual SPIKE Prime (2.x REPL stream)',
        available: () => Boolean(getHub()),
        open: link => {
            const socket = new VirtualSpikeClassicSocket(CLASSIC_URL, {hubState: getHub()});
            let ready = false;
            let id = 1;
            const waiting = [];
            const call = (method, params) => socket.send(JSON.stringify({jsonrpc: '2.0', id: id++, method, params}));
            const forward = bytes => call('send', {message: encodeBase64(bytes), encoding: 'base64'});
            socket.onmessage = event => {
                let message;
                try { message = JSON.parse(event.data); } catch { return; }
                if (message.method === 'didReceiveMessage' && message.params) link.send(decodeBase64(message.params.message));
            };
            socket.onclose = () => link.close();
            socket.onopen = () => {
                call('connect', {peripheralId: 'brickwright-virtual-spike-classic'});
                ready = true;
                for (const bytes of waiting.splice(0)) forward(bytes);
            };
            return {
                receive: bytes => {
                    if (ready && socket.readyState === 1) forward(bytes);
                    else waiting.push(bytes);
                },
                close: () => {
                    socket.onclose = null;
                    if (socket.readyState !== 3) socket.close();
                }
            };
        }
    });
};
