import Cards from '../../containers/cards.jsx';
import TipsLibrary from '../../containers/tips-library.jsx';
import decks from '../../lib/libraries/decks/index.jsx';

// Keep one activation boundary for the catalog and card renderer. Splitting
// these into separate requests makes selecting a tutorial pay a second fetch.
export {
    Cards,
    TipsLibrary,
    decks
};
