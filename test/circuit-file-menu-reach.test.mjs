// The File menu's four circuit actions must reach a receiver — including from a
// cold start, before the Circuit tab has ever been opened.
//
// THE CLASS OF BUG THIS HOLDS. bw-circuit-ui 1397493 deleted an import entry that
// "did nothing, said nothing and logged nothing for its entire life", and two whole
// menu COMPONENTS that were imported and placed in no tree. Lite has the same shape
// available to it in a different form: menu-bar.jsx dispatches a `bw-circuit-file`
// CustomEvent, and the only receiver is bw-circuit-ui's CircuitDesigner, which lite
// mounts LAZILY — `circuit-tab.jsx` calls `load()` only when the tab is visible or
// portalled into the stage column. A user who opens the File menu first therefore
// dispatched into an empty room: four menu items, no listener, no error.
//
// Two properties, because they fail independently:
//   1. every action the menu can dispatch is one the vendored receiver handles;
//   2. lite registers a cold-start listener that is NOT behind the visibility guard,
//      and replays the queued action once the receiver exists.
//
// A source scan rather than a rendered probe: there is no DOM harness in this repo
// (no jsdom, no testing-library), and the browser gates cover the designer once it is
// already up — which is precisely the state in which this bug is invisible.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const MENU_BAR = 'overlay/scratch-gui/src/components/menu-bar/menu-bar.jsx';
const CIRCUIT_TAB = 'overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx';
const DESIGNER = 'overlay/scratch-gui/src/lib/bw-circuit-ui/components/CircuitDesigner.jsx';

const dispatchedActions = src => {
    const found = new Set();
    // `new CustomEvent('bw-circuit-file', {detail: {action: 'load'}})`
    const re = /'bw-circuit-file'[^)]*?action:\s*'([a-z]+)'/g;
    let m;
    while ((m = re.exec(src))) found.add(m[1]);
    return found;
};

test('every circuit action the File menu dispatches is one the vendored receiver handles', () => {
    const actions = [...dispatchedActions(read(MENU_BAR))].sort();
    // The owner's design note in menu-bar.jsx: "exactly four top-level actions and
    // nothing more". Pinned, so adding a fifth has to come here and be checked
    // against the receiver rather than shipping as another silent no-op.
    assert.deepStrictEqual(actions, ['export', 'import', 'load', 'save'],
        'the File menu no longer dispatches exactly the four documented circuit actions');

    const designer = read(DESIGNER);
    // The receiver's own switch, read out of the vendored source. Not a hand-copied
    // list: if a re-vendor drops a branch, this goes red naming the action.
    const handled = new Set();
    for (const m of designer.matchAll(/action\s*===\s*'([a-z]+)'/g)) handled.add(m[1]);
    for (const action of actions) {
        assert.ok(handled.has(action),
            `File menu dispatches '${action}' and bw-circuit-ui's CircuitDesigner ` +
            `listener has no branch for it — the menu item is a silent no-op`);
    }
});

test('the cold-start listener is registered unconditionally, and replays what it queued', () => {
    const tab = read(CIRCUIT_TAB);

    // componentDidMount's body, up to the next method. The listener must live HERE
    // and not inside the `if (this.props.isVisible)` block that gates load() — that
    // guard is the whole reason the receiver can be absent.
    const mount = tab.slice(tab.indexOf('componentDidMount ()'));
    const visibleGuard = mount.indexOf('if (this.props.isVisible)');
    const registration = mount.indexOf(`addEventListener('bw-circuit-file'`);
    assert.ok(registration !== -1,
        'circuit-tab.jsx registers no bw-circuit-file listener: with the designer ' +
        'unmounted, the four File-menu items dispatch into an empty room');
    const guardEnd = mount.indexOf('}', mount.indexOf('loadExamples();', visibleGuard));
    assert.ok(registration > guardEnd,
        'the cold-start listener is inside the isVisible guard, so it is registered ' +
        'only in the case where it was never needed');

    // It must hand the action on rather than swallow it, and it must not echo itself.
    assert.match(tab, /_circuitFilePending/,
        'no queue for the action that arrived before the receiver existed');
    assert.match(tab, /bwReplay/,
        'the replay carries no marker, so the wake handler would re-queue its own echo');
    assert.match(tab, /if \(this\.state\.Designer \|\| this\.state\.error\) return;/,
        'the wake handler does not stand down once the vendored receiver is mounted, ' +
        'so a File-menu action would be handled twice');
    assert.match(tab, /removeEventListener\('bw-circuit-file'/,
        'the listener is never removed on unmount');
});
