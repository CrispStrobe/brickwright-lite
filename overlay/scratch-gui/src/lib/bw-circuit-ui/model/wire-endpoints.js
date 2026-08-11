/**
 * Endpoint-shape helpers shared by circuit rendering and migration tests.
 *
 * Live tap wires use `board`; older autosaves used `boardId`. Both describe a
 * breadboard hole, not a normal part terminal.
 */
export function isBoardEndpoint(endpoint) {
  return !!(endpoint && (endpoint.board || endpoint.boardId ||
    (endpoint.hole && !endpoint.part)));
}
