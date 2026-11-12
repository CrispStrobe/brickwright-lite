import test from 'node:test';
import assert from 'node:assert/strict';
import {openCircuitActions, circuitFileControl} from '../scripts/lib/circuit-actions.mjs';

function fixture ({portal = true, noExpandedAria = false} = {}) {
    const state = {expanded: false, visible: true, designers: 1, menus: 1, id: 'circuit-menu-owned', clicks: 0, lookups: []};
    const open = {count: async () => state.openCount ?? 1};
    const imported = {count: async () => 1};
    const absent = {count: async () => 0};
    const menu = {
        count: async () => state.menus,
        isVisible: async () => state.expanded,
        waitFor: async options => {
            assert.equal(options.state, 'visible');
            assert.equal(state.expanded, true);
            if (state.replaceDuringWait) state.id = 'circuit-menu-replacement';
        },
        getAttribute: async name => { assert.equal(name, 'role'); return 'dialog'; },
        locator: selector => { assert.equal(selector, '[data-editor-action="open"]'); return portal ? open : absent; },
        getByRole: (role, {name}) => {
            assert.equal(role, 'button');
            if (name.test(portal ? 'Import' : '📥 Import ▸')) return imported;
            if (name.test('📂 Open')) return open;
            return absent;
        }
    };
    const inline = portal ? {isVisible: async () => false} : menu;
    const trigger = {
        count: async () => 1,
        getAttribute: async name => name === 'aria-controls' ? (portal && state.expanded ? state.id : null) :
            (noExpandedAria ? null : String(state.expanded)),
        click: async () => { state.clicks++; state.expanded = !state.expanded; }
    };
    const designer = {
        count: async () => state.designers,
        isVisible: async () => state.visible,
        getByRole: (role, {name}) => { assert.equal(role, 'button'); assert.ok(name.test('More circuit controls')); return trigger; },
        locator: selector => { assert.equal(selector, '[data-toolbar-more-menu]'); return inline; }
    };
    const page = {locator: selector => {
        assert.equal(portal, true, 'legacy menus must stay scoped to their designer');
        assert.equal(selector, '[id="circuit-menu-owned"]');
        state.lookups.push(selector);
        return menu;
    }};
    return {state, designer, page, menu, open, imported};
}

test('portaled circuit controls bind to the originating trigger ID and open idempotently', async () => {
    const f = fixture();
    assert.equal(await openCircuitActions(f.page, f.designer), f.menu);
    assert.equal(await openCircuitActions(f.page, f.designer), f.menu);
    assert.equal(f.state.clicks, 1);
    assert.deepEqual(f.state.lookups, ['[id="circuit-menu-owned"]', '[id="circuit-menu-owned"]']);
    assert.equal(await circuitFileControl(f.menu, 'open'), f.open);
    assert.equal(await circuitFileControl(f.menu, 'import'), f.imported);
});

test('legacy controls stay inside their designer, including already-open menus without expanded ARIA', async () => {
    const f = fixture({portal: false, noExpandedAria: true});
    f.state.expanded = true;
    assert.equal(await openCircuitActions(f.page, f.designer), f.menu);
    assert.equal(f.state.clicks, 0);
    assert.equal(await circuitFileControl(f.menu, 'open'), f.open);
    assert.equal(await circuitFileControl(f.menu, 'import'), f.imported);
    assert.deepEqual(f.state.lookups, []);
});

test('hidden or ambiguous designers cannot activate a popup', async () => {
    for (const patch of [{visible: false}, {designers: 2}]) {
        const f = fixture(); Object.assign(f.state, patch);
        await assert.rejects(openCircuitActions(f.page, f.designer));
        assert.equal(f.state.clicks, 0);
    }
});

test('a replacement owner or ambiguous popup is refused before reaching a file control', async () => {
    for (const patch of [{replaceDuringWait: true}, {menus: 2}]) {
        const f = fixture(); Object.assign(f.state, patch);
        await assert.rejects(openCircuitActions(f.page, f.designer));
    }
});

test('ambiguous file controls and unsupported operations are refused', async () => {
    const f = fixture(); f.state.openCount = 2;
    await assert.rejects(circuitFileControl(f.menu, 'open'));
    await assert.rejects(circuitFileControl(f.menu, 'constructor'));
});
