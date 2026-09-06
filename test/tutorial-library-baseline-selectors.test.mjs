import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('overlay-owned tutorial selectors are mirrored exactly', () => {
    for (const file of [
        'src/components/cards/cards.jsx',
        'src/components/library/library.jsx',
        'src/components/menu-bar/menu-bar.jsx',
        'src/components/library-item/library-item.jsx',
        'src/components/modal/modal.jsx',
        'src/containers/library-item.jsx',
        'src/containers/tips-library.jsx'
    ]) {
        assert.equal(read(`packages/scratch-gui/${file}`), read(`overlay/scratch-gui/${file}`),
            `${file} package/overlay copies diverged`);
    }
});

test('the eager UI exposes product-owned tutorial journey selectors', () => {
    const menu = read('packages/scratch-gui/src/components/menu-bar/menu-bar.jsx');
    const library = read('packages/scratch-gui/src/components/library/library.jsx');
    const modal = read('packages/scratch-gui/src/components/modal/modal.jsx');
    const item = read('packages/scratch-gui/src/components/library-item/library-item.jsx');
    const itemContainer = read('packages/scratch-gui/src/containers/library-item.jsx');
    const tips = read('packages/scratch-gui/src/containers/tips-library.jsx');
    const cards = read('packages/scratch-gui/src/components/cards/cards.jsx');

    assert.match(menu, /data-testid="file-menu-toggle"/);
    assert.match(menu, /data-testid="tutorial-library-open"/);
    assert.match(library, /libraryItemId=\{data\.id\}/);
    assert.match(library, /dataTestId=\{this\.props\.dataTestId\}/);
    assert.match(modal, /data-testid=\{props\.dataTestId\}/);
    assert.match(itemContainer, /libraryItemId=\{this\.props\.libraryItemId\}/);
    assert.match(item, /data-library-item-id=\{this\.props\.libraryItemId\}/);
    assert.match(item, /data-testid="library-item"/);
    assert.match(tips, /dataTestId="tutorial-library-modal"/);
    for (const selector of [
        'tutorial-card', 'tutorial-card-body', 'tutorial-card-image', 'tutorial-card-video',
        'tutorial-card-next', 'tutorial-card-prev', 'tutorial-card-close', 'tutorial-card-show-all'
    ]) assert.match(cards, new RegExp(`data-testid="${selector}"`), selector);
    assert.match(cards, /data-tutorial-deck-id=\{activeDeckId\}/);
    assert.match(cards, /data-tutorial-step=\{step\}/);
});

test('the baseline selector change does not implement the P15 split', () => {
    const gui = read('packages/scratch-gui/src/components/gui/gui.jsx');
    const cardsReducer = read('packages/scratch-gui/src/reducers/cards.js');
    assert.match(gui, /import TipsLibrary from/);
    assert.match(gui, /import Cards from/);
    assert.match(cardsReducer, /import decks from/);
    assert.doesNotMatch(gui, /webpackChunkName:\s*["']tutorial-library/);
});
