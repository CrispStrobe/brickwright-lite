/**
 * Pane layout reducer — three columns, each with one or two stacked slots.
 *
 * A slot shows one content surface. Content ids:
 *   blocks-palette, blocks-canvas, stage, sprites, code, debugger, circuit
 *
 * From gui-layout.md: "A pane is a slot with a content id, not a fixed thing."
 * This reducer owns the layout model that gui.jsx renders.
 */

/**
 * The stage-size buttons live in a different reducer (scratch-gui/StageSize), and until now the
 * two knew nothing about each other. That made the small/large buttons look broken: they resize
 * the stage INSIDE the right column, but the column keeps its share of the row, so the editor
 * never gets the space back. Measured headlessly at 1600px: editor 870px in both modes, right
 * column pinned at 730px (flex-basis 28.6%), while the stage's own min-content correctly halved
 * from 482px to 242px. The stage shrank; its column did not.
 *
 * Reacting to another reducer's action is the right shape here — the column share IS layout
 * state, and this reducer owns it.
 */
const SET_STAGE_SIZE = 'scratch-gui/StageSize/SET_STAGE_SIZE';

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

const STORAGE_KEY = 'bw-pane-layout';

function loadFromStorage() {
  try {
    const stored = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* fine */ }
  return null;
}

function saveToStorage(state) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        left: state.left,
        middle: state.middle,
        right: state.right,
        activePreset: state.activePreset,
      }));
    }
  } catch { /* fine */ }
}

const initialState = loadFromStorage() || {
  ...PRESETS.blocks,
  activePreset: 'blocks',
};

export default function paneLayoutReducer(state = initialState, action) {
  let next;
  switch (action.type) {
    case SET_PANE_SIZE: {
      const { column, size } = action;
      if (!state[column]) return state;
      next = { ...state, [column]: { ...state[column], size }, activePreset: null };
      break;
    }
    case SET_SLOT_CONTENT: {
      const { column, position, contentId } = action;
      if (!state[column]) return state;
      next = { ...state, [column]: { ...state[column], [position]: contentId }, activePreset: null };
      break;
    }
    case SET_STAGE_SIZE: {
      // Clicking "small stage" IS a request for more editor room, so it deliberately overrides
      // an earlier manual cycling of this column — the user is asking for it right now, and a
      // button that silently did nothing because of a choice made ten minutes ago is worse than
      // one that overrides it. A later manual cycle wins again, until the next stage-size click.
      const size = action.stageSize === 'small' ? 's' : 'm';
      if (!state.right || state.right.size === size) return state;
      next = { ...state, right: { ...state.right, size }, activePreset: null };
      break;
    }
    case APPLY_PRESET: {
      const preset = PRESETS[action.preset];
      if (!preset) return state;
      next = { ...preset, activePreset: action.preset };
      break;
    }
    default:
      return state;
  }
  saveToStorage(next);
  return next;
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
