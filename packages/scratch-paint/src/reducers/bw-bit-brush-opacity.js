const CHANGE_BIT_BRUSH_OPACITY = 'scratch-paint/bw-bit-brush-opacity/CHANGE';

const reducer = (state = 100, action) => {
    if (action.type !== CHANGE_BIT_BRUSH_OPACITY) return state;
    const value = Number(action.opacity);
    return Number.isFinite(value) ? Math.max(1, Math.min(100, Math.round(value))) : state;
};

const changeBitBrushOpacity = opacity => ({type: CHANGE_BIT_BRUSH_OPACITY, opacity});

export {reducer as default, changeBitBrushOpacity};
