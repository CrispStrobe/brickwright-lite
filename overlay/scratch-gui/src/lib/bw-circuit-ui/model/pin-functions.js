/**
 * Audited alternate-function metadata for controller pins.
 *
 * `null` is intentional: the board sidecar knows the pin, but its alternate
 * functions have not been audited yet. `[]` means the pin was audited and has
 * no alternate functions. Keeping those states distinct prevents the chooser
 * from presenting guesses as hardware facts.
 */
import './sidecar-loader.js';
import { getSidecar } from './parts-registry.js';

function terminalFor(boardKind, pinName) {
  const sidecar = getSidecar(boardKind);
  if (!sidecar || !Array.isArray(sidecar.terminals)) return undefined;
  const wanted = String(pinName).toLowerCase();
  return sidecar.terminals.find(terminal => String(terminal.name).toLowerCase() === wanted);
}

/**
 * @returns {string[]|null|undefined} audited functions, unaudited, or unknown
 */
export function getPinFunctions(boardKind, pinName) {
  const terminal = terminalFor(boardKind, pinName);
  if (!terminal) return undefined;
  if (!Object.prototype.hasOwnProperty.call(terminal, 'functions')) return null;
  return Array.isArray(terminal.functions) ? terminal.functions : null;
}

/** Return the complete sidecar terminal record when it exists. */
export function getPinInfo(boardKind, pinName) {
  return terminalFor(boardKind, pinName);
}
