// PXT collection operations used by the retained particle sources.
// Adapted from Microsoft pxt v13.2.1 pxtsim/libgeneric.ts (MIT).
// Copyright (c) Microsoft Corporation. See pxt-particle-collections.LICENSE.
// https://github.com/microsoft/pxt/blob/c40f412dc5bebb915a5891cd62fe956e198fb194/pxtsim/libgeneric.ts
// The native particle host stores collections as local JavaScript arrays.
// Match Array_ bounds before RefCollection's splice; never install prototype methods.
const typeCheck = array => {
    if (!Array.isArray(array)) throw new TypeError('Particle collection is not an Array');
};
const removeAt = (array, index) => {
    typeCheck(array);
    if (!(index >= 0 && index < array.length)) return undefined;
    return array.splice(index, 1)[0];
};
const removeElement = (array, element) => {
    typeCheck(array);
    const index = array.indexOf(element, 0);
    if (index < 0) return 0;
    removeAt(array, index);
    return 1;
};
module.exports = Object.freeze({removeAt, removeElement});
