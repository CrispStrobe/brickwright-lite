/**
 * Pane layout reducer — three columns, each with one or two stacked slots.
 *
 * A slot shows one content surface. Content ids:
 *   blocks-palette, blocks-canvas, stage, sprites, code, debugger, circuit
 *
 * From gui-layout.md: "A pane is a slot with a content id, not a fixed thing."
 * This reducer owns the layout model that gui.jsx renders.
 */

const SET_PANE_SIZE = 'scratch-gui/pane-layout/SET_PANE_SIZE';
const SET_SLOT_CONTENT = 'scratch-gui/pane-layout/SET_SLOT_CONTENT';
const APPLY_PRESET = 'scratch-gui/pane-layout/APPLY_PRESET';

/** Content IDs — the surfaces that can be placed in slots */
export const CONTENT_IDS = [
  'blocks-palette',
  'blocks-canvas',
  'stage',
  'sprites',
  'code',
  'debugger',
  'circuit',
  'costumes',
  'sounds',
];

/** The four presets from gui-layout.md */
export const PRESETS = {
  blocks: {
    left:   { upper: 'blocks-palette', lower: null, size: 'm' },
    middle: { upper: 'blocks-canvas',  lower: null, size: 'l' },
    right:  { upper: 'stage',          lower: 'sprites', size: 'm' },
  },
  code: {
    left:   { upper: 'blocks-palette', lower: null, size: 'xs' },
    middle: { upper: 'code',           lower: null, size: 'xl' },
    right:  { upper: 'stage',          lower: 'sprites', size: 's' },
  },
  hardware: {
    left:   { upper: 'blocks-palette', lower: null, size: 's' },
    middle: { upper: 'blocks-canvas',  lower: null, size: 'm' },
    right:  { upper: 'circuit',        lower: null, size: 'l' },
  },
  debug: {
    left:   { upper: 'blocks-palette', lower: null, size: 'xs' },
    middle: { upper: 'blocks-canvas',  lower: null, size: 'l' },
    right:  { upper: 'debugger',       lower: 'stage', size: 'm' },
  },
};

const initialState = {
  ...PRESETS.blocks,
  activePreset: 'blocks',
};

export default function paneLayoutReducer(state = initialState, action) {
  switch (action.type) {
    case SET_PANE_SIZE: {
      const { column, size } = action;
      if (!state[column]) return state;
      return {
        ...state,
        [column]: { ...state[column], size },
        activePreset: null, // custom layout
      };
    }
    case SET_SLOT_CONTENT: {
      const { column, position, contentId } = action;
      if (!state[column]) return state;
      return {
        ...state,
        [column]: { ...state[column], [position]: contentId },
        activePreset: null,
      };
    }
    case APPLY_PRESET: {
      const preset = PRESETS[action.preset];
      if (!preset) return state;
      return { ...preset, activePreset: action.preset };
    }
    default:
      return state;
  }
}

// Action creators
export function setPaneSize(column, size) {
  return { type: SET_PANE_SIZE, column, size };
}

export function setSlotContent(column, position, contentId) {
  return { type: SET_SLOT_CONTENT, column, position, contentId };
}

export function applyPreset(preset) {
  return { type: APPLY_PRESET, preset };
}
