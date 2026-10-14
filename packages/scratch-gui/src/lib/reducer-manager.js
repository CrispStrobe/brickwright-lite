/*
 * A store-local reducer registry. Keeping this independent of React and Redux's
 * module singleton makes the state transition small enough to test directly.
 */
const createReducerManager = (combineReducers, initialReducers) => {
    const reducers = Object.assign({}, initialReducers);
    let combined = combineReducers(reducers);

    return {
        reduce: (state, action) => combined(state, action),
        install: (key, reducer) => {
            if (!key || typeof reducer !== 'function') {
                throw new TypeError('A dynamic reducer needs a key and reducer function');
            }
            if (reducers[key]) {
                if (reducers[key] !== reducer) {
                    throw new Error(`Reducer ${key} is already installed with a different implementation`);
                }
                return false;
            }
            reducers[key] = reducer;
            combined = combineReducers(reducers);
            return true;
        }
    };
};

module.exports = createReducerManager;
