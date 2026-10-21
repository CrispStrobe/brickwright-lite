import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../overlay/scratch-gui/src/containers/lazy-pseudocode-importer.jsx',
    import.meta.url), 'utf8');
// Execute the shipped host lifecycle and handlers, stopping before JSX render.
const declaration = source.slice(source.indexOf('class LazyPseudocodeImporter'), source.indexOf('    render () {'));
const fixture = () => {
    const events = new EventTarget();
    class Component {
        constructor (props) { this.props = props; }
        setState (patch) { this.state = {...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch)}; }
    }
    const Host = new Function('React', 'createLazyImporter', 'window', 'CustomEvent',
        `${declaration}}\nreturn LazyPseudocodeImporter;`)(
        {Component}, () => () => null, events, CustomEvent);
    const host = new Host({isVisible: false, vm: {runtime: {}}});
    host.componentDidMount();
    const send = detail => events.dispatchEvent(new CustomEvent('bw-load-pseudocode', {detail}));
    return {host, events, send};
};

test('ordinary startup and malformed handoffs keep Code lazy', () => {
    const {host, send} = fixture();
    assert.equal(host.state.activated, false);
    send({source: 'sim-lab'});
    assert.equal(host.state.activated, false);
    host.componentWillUnmount();
});

test('cold example selection wakes Code and replays only the latest program once ready', () => {
    const {host, events, send} = fixture();
    const received = [];
    send({code: 'first'});
    send({code: 'latest', source: 'sim-lab:example'});
    assert.equal(host.state.activated, true);
    events.addEventListener('bw-load-pseudocode', e => received.push(e.detail));
    host.handleImporterReady();
    host.handleImporterReady();
    assert.deepEqual(received, [{code: 'latest', source: 'sim-lab:example'}]);
    send({code: 'already mounted'});
    host.handleImporterReady();
    assert.deepEqual(received.map(d => d.code), ['latest', 'already mounted']);
    host.componentWillUnmount();
});

test('a lazy chunk retry preserves the selected example and unmount removes its listener', () => {
    const {host, events, send} = fixture();
    send({code: 'pending'});
    host.handleRetry();
    const received = [];
    events.addEventListener('bw-load-pseudocode', e => received.push(e.detail.code));
    host.handleImporterReady();
    assert.deepEqual(received, ['pending']);
    host.componentWillUnmount();
    host.importerReady = false;
    send({code: 'after unmount'});
    assert.equal(host.pendingPseudocodeDetail, null);
});

test('superseded and closed handoffs release their loading callers', () => {
    const {host, send} = fixture();
    const completed = [];
    send({code: 'old', onComplete: result => completed.push(['old', result.ok])});
    send({code: 'new', onComplete: result => completed.push(['new', result.ok])});
    assert.deepEqual(completed, [['old', false]]);
    host.componentWillUnmount();
    assert.deepEqual(completed, [['old', false], ['new', false]]);
});
