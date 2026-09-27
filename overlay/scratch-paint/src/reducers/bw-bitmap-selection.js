const SET_KIND = 'scratch-paint/bw-bitmap-selection/SET_KIND';
const SET_TOLERANCE = 'scratch-paint/bw-bitmap-selection/SET_TOLERANCE';

const initialState = {kind: 'rectangle', tolerance: 0};

const reducer = (state = initialState, action) => {
    switch (action.type) {
    case SET_KIND:
        return {...state, kind: ['rectangle', 'lasso', 'wand'].includes(action.kind) ? action.kind : state.kind};
    case SET_TOLERANCE:
        return {...state, tolerance: Math.max(0, Math.min(255, Number(action.tolerance) || 0))};
    default:
        return state;
    }
};

const setBitmapSelectionKind = kind => ({type: SET_KIND, kind});
const setBitmapSelectionTolerance = tolerance => ({type: SET_TOLERANCE, tolerance});

export {setBitmapSelectionKind, setBitmapSelectionTolerance};
export default reducer;
