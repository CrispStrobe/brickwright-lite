// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const guiRequire = createRequire(new URL('../../packages/scratch-gui/package.json', import.meta.url));
export const React = guiRequire('react');
export const {create, act} = guiRequire('react-test-renderer');
const babel = guiRequire('@babel/core');
const sourceRoot = new URL('../../overlay/scratch-gui/src/components/tw-pseudocode/', import.meta.url);

export async function loadSimulator () {
    const names = ['spike-arena-pane', 'spike-simulator-pane'];
    const urls = Object.fromEntries(names.map(name => [name, new URL(`${name}-test-${randomUUID()}.mjs`, sourceRoot)]));
    try {
        for (const name of names) {
            let source = await readFile(new URL(`${name}.jsx`, sourceRoot), 'utf8');
            source = source.replace("from 'react'", `from '${pathToFileURL(guiRequire.resolve('react')).href}'`);
            for (const child of names) source = source.replaceAll(`'./${child}.jsx'`, `'${urls[child].href}'`);
            await writeFile(urls[name], babel.transformSync(source, {filename: `${name}.jsx`, babelrc: false,
                configFile: false, presets: [[guiRequire.resolve('@babel/preset-react'), {runtime: 'classic'}]]}).code);
        }
        // Lazy imports may occur after this returns; caller owns cleanup.
        const Pane = (await import(urls['spike-simulator-pane'].href)).default;
        return {Pane, cleanup: () => Promise.all(Object.values(urls).map(url => unlink(url)))};
    } catch (error) {
        await Promise.all(Object.values(urls).map(url => unlink(url).catch(() => {})));
        throw error;
    }
}

export function installBrowser () {
    const keys = ['window', 'document', 'fetch', 'CustomEvent', 'requestAnimationFrame', 'cancelAnimationFrame'];
    const saved = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
    const events = new Map(), frames = [], scripts = [], requests = [];
    const win = {
        devicePixelRatio: 1,
        addEventListener (type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener (type, fn) { events.get(type)?.delete(fn); },
        dispatchEvent (event) { for (const fn of [...events.get(event.type) || []]) fn(event); }
    };
    globalThis.window = win;
    globalThis.CustomEvent = class {constructor (type, init = {}) { this.type = type; this.detail = init.detail; }};
    globalThis.document = {createElement: () => ({}), head: {appendChild: script => {
        scripts.push(script);
        queueMicrotask(() => script.onerror?.());
    }}};
    globalThis.fetch = async url => {
        requests.push(url);
        try {
            const body = await readFile(new URL(`../../overlay/scratch-gui/${url}`, import.meta.url), 'utf8');
            return {ok: true, json: async () => JSON.parse(body)};
        } catch { return {ok: false, status: 404}; }
    };
    globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    globalThis.cancelAnimationFrame = () => {};
    let now = 0;
    return {win, scripts, requests,
        async frames (count) {
            for (let i = 0; i < count; i++) {
                const due = frames.splice(0); now += 1000 / 30;
                await act(async () => { for (const callback of due) callback(now); });
            }
        },
        restore () { for (const key of keys) { if (saved[key] === undefined) delete globalThis[key]; else globalThis[key] = saved[key]; } }
    };
}
export const one = (renderer, id) => renderer.root.find(node => typeof node.type === 'string' && node.props['data-testid'] === id);
export async function settle (predicate, label) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
    throw new Error(`Timed out waiting for ${label}`);
}
