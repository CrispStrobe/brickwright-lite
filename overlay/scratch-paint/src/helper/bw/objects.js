import paper from '@scratch/paper';

import {getAllSelectableRootItems, setItemSelection, clearSelection} from '../selection';

/**
 * Brickwright: the model behind the objects tree.
 *
 * Upstream's only notion of stacking is four bring-forward/send-back buttons, which means you can
 * only reason about z-order by clicking and looking. This exposes the layer's children as a list
 * you can see, name, lock, hide and reorder.
 *
 * HIDING IS AN EDITING AID, NOT A COSTUME PROPERTY. A Scratch costume has no concept of a hidden
 * element, so a hidden item is marked with `data.bwHidden` and made visible again around export
 * (see hocs/update-image-hoc.jsx). Hiding something can therefore never drop it from the saved
 * costume — the alternative, where the eye icon quietly deletes artwork on the next edit, is not
 * a trade worth making for a convenience toggle.
 */

const HIDDEN_TAG = 'bwHidden';

/**
 * A human label for an item that has no name of its own.
 * @param {!paper.Item} item The item.
 * @return {!string} A short type name.
 */
const describeItem = function (item) {
    if (item instanceof paper.PointText) {
        // The words themselves identify a text object far better than the word "Text" does.
        const content = (item.content || '').trim().replace(/\s+/g, ' ');
        return content ? content.slice(0, 24) : 'Text';
    }
    if (item instanceof paper.Group) return 'Group';
    if (item instanceof paper.Raster) return 'Image';
    if (item instanceof paper.CompoundPath) return 'Compound path';
    if (item instanceof paper.Shape) return 'Shape';
    return 'Path';
};

/**
 * The costume's objects, TOP FIRST.
 *
 * paper stores children bottom-first (children[0] paints first, so it is furthest back); every
 * design tool lists them the other way round, because "top of the list" and "in front" should
 * mean the same thing.
 *
 * @return {Array<object>} `{item, id, index, name, label, selected, locked, hidden}` per object.
 */
const listObjects = function () {
    const items = getAllSelectableRootItems();
    return items
        .map(item => ({
            item: item,
            id: item.id,
            index: item.index,
            name: item.name || '',
            label: item.name || describeItem(item),
            selected: !!item.selected,
            locked: !!item.locked,
            hidden: !!(item.data && item.data[HIDDEN_TAG])
        }))
        .sort((a, b) => b.index - a.index);
};

/**
 * Select one object, replacing or extending the current selection.
 * @param {!paper.Item} item The item to select.
 * @param {boolean} additive True to add to the selection rather than replace it.
 * @param {!function} clearSelectedItems Callback to clear the redux selection.
 */
const selectObject = function (item, additive, clearSelectedItems) {
    // A locked item cannot be dragged or transformed, so selecting it would only produce a
    // selection that ignores every subsequent action.
    if (item.locked) return;
    if (!additive) clearSelection(clearSelectedItems);
    setItemSelection(item, true);
};

/**
 * Lock or unlock an object. A locked item is skipped by hit tests, so it cannot be picked up by
 * accident while working on something in front of it.
 * @param {!paper.Item} item The item.
 * @param {!boolean} locked Whether it should be locked.
 */
const setObjectLocked = function (item, locked) {
    item.locked = locked;
    if (locked && item.selected) {
        item.selected = false;
    }
};

/**
 * Show or hide an object while editing. See the note at the top of this file — this is not saved
 * into the costume.
 * @param {!paper.Item} item The item.
 * @param {!boolean} hidden Whether it should be hidden.
 */
const setObjectHidden = function (item, hidden) {
    item.data[HIDDEN_TAG] = hidden;
    item.visible = !hidden;
    if (hidden && item.selected) {
        item.selected = false;
    }
};

/**
 * Rename an object. An empty name clears it, so the list falls back to the type label.
 * @param {!paper.Item} item The item.
 * @param {!string} name The new name.
 */
const renameObject = function (item, name) {
    const trimmed = String(name || '').trim();
    // paper treats null as "no name"; an empty string would be a name that renders as nothing.
    item.name = trimmed === '' ? null : trimmed;
};

/**
 * Move an object to a new position in the top-first list the panel shows.
 * @param {!paper.Item} item The item being moved.
 * @param {!number} toListIndex Target position in the top-first list.
 * @return {boolean} True if the order changed.
 */
const reorderObject = function (item, toListIndex) {
    const parent = item.parent;
    if (!parent) return false;
    const count = parent.children.length;
    // The list is top-first and paper's children are bottom-first, so the position flips.
    const target = Math.max(0, Math.min(count - 1, count - 1 - toListIndex));
    if (target === item.index) return false;
    parent.insertChild(target, item);
    return true;
};

/**
 * Make every hidden item visible again, and report which ones so they can be re-hidden.
 * Used around export so hiding never changes what is saved.
 * @return {Array<paper.Item>} The items that were hidden.
 */
const revealHiddenItems = function () {
    if (!paper.project) return [];
    const hidden = [];
    for (const item of getAllSelectableRootItems()) {
        if (item.data && item.data[HIDDEN_TAG]) {
            item.visible = true;
            hidden.push(item);
        }
    }
    return hidden;
};

/**
 * Re-hide the items returned by revealHiddenItems.
 * @param {!Array<paper.Item>} hidden The items to hide again.
 */
const rehideItems = function (hidden) {
    for (const item of hidden) {
        item.visible = false;
    }
};

export {
    describeItem,
    listObjects,
    rehideItems,
    renameObject,
    reorderObject,
    revealHiddenItems,
    selectObject,
    setObjectHidden,
    setObjectLocked,
    HIDDEN_TAG
};
