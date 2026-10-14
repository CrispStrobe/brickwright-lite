const SET_INDEPENDENT_HANDLES = 'scratch-paint/bw-independent-handles/SET';

const reducer = (state = false, action) => action.type === SET_INDEPENDENT_HANDLES ?
    Boolean(action.enabled) : state;

const setIndependentHandles = enabled => ({type: SET_INDEPENDENT_HANDLES, enabled});

export {reducer as default, setIndependentHandles};
