# Native Arcade splash and long text

Status: implementation claimed; qualification pending.

The reference is the pinned MIT `game/textDialogs.ts` retained by the Arcade
runtime. The existing generated dialog module contains `SplashDialog`, `Dialog`
and their fonts, frames, paging and scrolling algorithms. Attribution remains
with the retained source and its existing notice.

## Required behavior

- Push a child scene and keep the parent visible through it. Render the parent's
  live drawing layers without changing the active `game.currentScene()` identity.
  Suspend its gameplay frame updates while permitting independently running
  fibers to change its artwork. A frozen background copy is insufficient.
- Disable user controller callbacks during the dialog while retaining held-button
  polling. Splash requires release followed by a new A press. Other buttons and
  arbitrary DOM keys do not dismiss it.
- Preserve long text's six fixed layouts, original font choice, pagination and
  draw-before-input order. A or Down advances; Up goes back. Each action requires
  release before another press. The final forward action closes the dialog.
- Clear the child background, pop its scene and resume the caller with ownership
  checks after waits, stop, restart and scene replacement.
- Expose accessible labels and controls that mirror the native presentation and
  send real controller edges. They do not resolve the blocked caller directly.
- Diagnose unsupported dynamic layouts and opaque inspection values. Do not
  silently replace an unknown layout with Center.

## Qualification boundary

Compare original and native pixels at matching source events and page/scroll
phases. Check held and released inputs, parent visibility, mutable artwork,
continuation, cancellation, Code editing, export/reimport and saved SB3 reopening.
Qualify the actual application input path on a matching hosted GUI artifact.
Initial and resumed scene frame timing remains a named scheduler dependency;
this contract does not claim timing or whole-game completion before those controls.
