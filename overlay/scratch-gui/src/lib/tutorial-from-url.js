/**
 * @fileoverview
 * Utility function to detect tutorial id from query paramenter on the URL.
 */

import {URL_ID_TO_DECK_ID} from './libraries/decks/metadata';
import analytics from './analytics';

/**
 * Get the tutorial id from the given numerical id (representing the
 * url id of the tutorial).
 * @param {number} urlId The URL Id for the tutorial
 * @returns {string} The string id for the tutorial, or null if the URL ID
 * was not found.
 */
const getDeckIdFromUrlId = urlId => {
    if (!Object.prototype.hasOwnProperty.call(URL_ID_TO_DECK_ID, urlId)) return null;
    const deckId = URL_ID_TO_DECK_ID[urlId];
    analytics.event({
        category: 'how-to',
        action: 'load from url',
        label: `${deckId}`
    });
    return deckId;
};

/**
 * Check if there's a tutorial id provided as a query parameter in the URL.
 * Return the corresponding tutorial id or null if not found.
 * @param {object} queryParams the results of parsing the query string
 * @return {string} The ID of the requested tutorial or null if no tutorial was
 * requested or found.
 */
const detectTutorialId = queryParams => {
    const tutorialID = Array.isArray(queryParams.tutorial) ?
        queryParams.tutorial[0] :
        queryParams.tutorial;
    if (typeof tutorialID === 'undefined') return null;
    if (tutorialID === 'all') return tutorialID;
    return getDeckIdFromUrlId(tutorialID);
};

export {
    detectTutorialId
};
