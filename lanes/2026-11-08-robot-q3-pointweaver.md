# Robot Lab — Q3 Point Weaver motor-foot mount redesign and promotion

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab Q3 lane.
Branch: `lane/robot-q3-pointweaver-20261108`.
Task: Q3 in `lanes/2026-11-03-robot-lab-pending.md` (handoff section 000).

Scope: `pointweaver` `.ldr`/`.mpd` geometry (static/sim-lab/models); its contract
in `docs/data/robot-lab-qualification.json` under the existing nine-intake judge
`five-bar-v1` (registered by #1639; judge and harness unchanged); source fixture
`test/fixtures/model-files/pointweaver-source/`; registry move from
`experimental-models.js` to `MODELS`; mechanism, catalogue and lesson entries
regenerated; checkpoint record; the piece counts in the nine-intake gate, assets
test and handoff. `test/bw-sim-models-solid.test.mjs` is not loosened.

Redesign (the old rear stack foot 20 + pad 10 + rail 20 + cross 20 = 70 LDU had
no single standard pin and needed two pins in the rail hole):
- removed the eight thin 1x3 foot pads (6632) and the four rear rail-to-cross
  2L pins;
- lowered every motor assembly part (motors, side beams, mounts, posts, post
  pins, feet) and the whole linkage 10 LDU, so each foot sits directly on its
  rail; only the vertical (y) coordinate changes, the planar x/z geometry the
  `five-bar-v1` law measures is unchanged;
- each rear foot (z = -180): one 3L pin through foot, rail and base cross; it
  also fastens rail to cross, so the front base stays joined to the hub section;
- each front foot (z = -20): one 2L pin through foot and rail;
- hub section: the rear ground foot (spacer, cross and pins) moved from z = -400
  to z = -360, symmetric to z = -240 about the hub, off the hub-mount hole it
  shared;
- `endpoint_marker_tip` moved 10 LDU so its centre collar clears the thin marker.
128 -> 116 placements; program unchanged.

Qualification: hosted ordinary, strict and disconnected (`left_forearm`
removed) runs. Browser, saved-project replay, export and manual controls are
recorded as `notRun`.
