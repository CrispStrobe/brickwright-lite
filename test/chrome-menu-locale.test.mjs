import test from 'node:test';
import assert from 'node:assert/strict';
import {chromeMessages, withChromeMessages} from '../overlay/scratch-gui/src/lib/bw-chrome-messages.js';

test('custom chrome catalog follows app locale and preserves upstream messages', () => {
    const base = {en: {existing: 'Existing'}, de: {existing: 'Vorhanden'}, 'de-CH': {existing: 'Schweiz'}};
    const merged = withChromeMessages(base);
    assert.deepEqual(base, {en: {existing: 'Existing'}, de: {existing: 'Vorhanden'}, 'de-CH': {existing: 'Schweiz'}});
    assert.equal(merged.de.existing, 'Vorhanden');
    assert.equal(merged['de-CH']['gui.workspace.heading'], 'Arbeitsbereich');
    assert.equal(merged.de['gui.menuBar.gettingStarted'], 'Erste Schritte…');
    assert.equal(merged.en['gui.workspace.heading'], 'Workspace');
    assert.equal(merged.de['gui.gui.blocksTab'], 'Blöcke');
    assert.equal(merged.de['gui.gui.circuitTab'], 'Schaltung');
});

test('English and German cover the same messages and preserve interpolation fields', () => {
    assert.deepEqual(Object.keys(chromeMessages.en), Object.keys(chromeMessages.de));
    const fields = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const [id, english] of Object.entries(chromeMessages.en)) {
        assert.ok(chromeMessages.de[id], id);
        assert.deepEqual(fields(chromeMessages.de[id]), fields(english), id);
    }
});
