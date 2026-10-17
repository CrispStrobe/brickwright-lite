import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromeMessages, withChromeMessages} from '../overlay/scratch-gui/src/lib/bw-chrome-messages.js';

test('custom chrome catalog follows app locale and preserves upstream messages', () => {
    const base = {en: {existing: 'Existing'}, de: {existing: 'Vorhanden'}, 'de-CH': {existing: 'Schweiz'}};
    const merged = withChromeMessages(base);
    assert.deepEqual(base, {en: {existing: 'Existing'}, de: {existing: 'Vorhanden'}, 'de-CH': {existing: 'Schweiz'}});
    assert.equal(merged.de.existing, 'Vorhanden');
    assert.equal(merged['de-CH']['gui.workspace.heading'], 'Arbeitsbereich');
    assert.equal(merged.de['gui.menuBar.gettingStarted'], 'Erste Schritte…');
    assert.deepEqual(merged.en, base.en, 'English uses the descriptors already shipped by each component');
    assert.equal(merged.de['gui.gui.blocksTab'], 'Blöcke');
    assert.equal(merged.de['gui.gui.circuitTab'], 'Schaltung');
});

test('German chrome translations have real English defaults and preserve interpolation fields', () => {
    const defaults = new Map();
    for (const file of ['components/gui/gui.jsx', 'components/gui/chrome-toggle.jsx',
        'components/menu-bar/menu-bar.jsx', 'components/menu-bar/settings-menu.jsx']) {
        const source = readFileSync(new URL(`../overlay/scratch-gui/src/${file}`, import.meta.url), 'utf8');
        for (const match of source.matchAll(/\bt\('([^']+)', '([^']*)'\)/g)) defaults.set(match[1], match[2]);
        for (const match of source.matchAll(/\bid:\s*'([^']+)',\s*defaultMessage:\s*'([^']*)'/g)) defaults.set(match[1], match[2]);
        for (const match of source.matchAll(/<FormattedMessage\b([^>]+)\/>/g)) {
            const id = match[1].match(/\bid="([^"]+)"/);
            const text = match[1].match(/\bdefaultMessage="([^"]+)"/);
            if (id && text) defaults.set(id[1], text[1]);
        }
    }
    const fields = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const [id, german] of Object.entries(chromeMessages.de)) {
        assert.ok(defaults.has(id), `${id} has no English default in its actual component`);
        assert.deepEqual(fields(german), fields(defaults.get(id)), id);
    }
});
