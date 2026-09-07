// SPDX-License-Identifier: BSD-3-Clause
// Host-only entry point. This module imports node:net and must not enter a web bundle.
import net from 'node:net';
import BrickStateRuntimeConnector from '../../overlay/scratch-gui/src/lib/virtual-hub/brick-state-runtime-connector.js';

export const DEFAULT_MAX_BUFFERED_BYTES = 256 * 1024;

const validateEndpoint = ({host, port}) => {
    if (!net.isIP(host)) throw new TypeError('Renode state host must be a numeric IP address');
    const address = host.toLowerCase();
    const loopback = address === '::1' || address.startsWith('127.');
    if (!loopback) throw new TypeError('Renode state endpoint must be loopback');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new TypeError('Renode state port must be between 1 and 65535');
    }
};

export const createLoopbackTcpTransport = ({
    host = '127.0.0.1', port, maxBufferedBytes = DEFAULT_MAX_BUFFERED_BYTES,
    createConnection = options => net.createConnection(options)
}) => {
    validateEndpoint({host, port});
    if (!Number.isInteger(maxBufferedBytes) || maxBufferedBytes < 1024 ||
        maxBufferedBytes > 4 * 1024 * 1024) throw new TypeError('invalid transport buffer limit');
    const socket = createConnection({host, port});
    let dataHandler = () => {};
    let closeHandler = () => {};
    let closed = false;
    socket.on('data', chunk => dataHandler(chunk.toString('utf8')));
    socket.on('error', () => {
        // Error detail belongs in the privileged host log. The neutral client
        // gets one lifecycle close and may explicitly reconnect.
        if (!closed) { closed = true; closeHandler(); }
    });
    socket.on('close', () => {
        if (!closed) { closed = true; closeHandler(); }
    });
    return {
        onData (handler) {
            if (typeof handler !== 'function') throw new TypeError('data handler must be callable');
            dataHandler = handler;
        },
        onClose (handler) {
            if (typeof handler !== 'function') throw new TypeError('close handler must be callable');
            closeHandler = handler;
        },
        send (line) {
            if (closed || socket.destroyed) throw new Error('Renode state transport is closed');
            const bytes = Buffer.byteLength(line, 'utf8');
            if (bytes > maxBufferedBytes || socket.writableLength + bytes > maxBufferedBytes) {
                throw new Error('Renode state transport backpressure limit reached');
            }
            socket.write(line, 'utf8');
        },
        close () {
            if (!closed) { closed = true; socket.destroy(); }
        }
    };
};

export const createRenodeBrickStateRuntime = ({endpoint, ...connectorOptions}) => {
    if (!endpoint || typeof endpoint !== 'object') throw new TypeError('endpoint is required');
    const createTransport = () => createLoopbackTcpTransport(endpoint);
    // Deliberately return a disconnected connector: UI/application policy owns
    // user consent, process launch, endpoint selection, and reconnect timing.
    return new BrickStateRuntimeConnector({...connectorOptions, createTransport});
};
