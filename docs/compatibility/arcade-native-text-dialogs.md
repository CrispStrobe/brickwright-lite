# Native Arcade splash and long text

Status: native static presentation and input controls qualified; application and scene timing qualification pending.

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

## Focused controls

The original pinned simulator and native VM match every pixel for Splash and
all six LongText layouts with an info parent. A mutable parent background image
and parent paint callback also match while the child remains the active scene.
The original controller controls cover initial held A, release/new A, ignored B,
held forward paging, previous page, and final continuation. Primitive title `0`
and subtitle `false` retain their pixels and falsy geometry through Code, blocks,
export execution, reimport and saved SB3 reopening. Stop/restart cancels the old
continuation. Accessible controls send controller edges; Boolean question
controls retain their existing answer path.

The original push/pop particle lifecycle also matches the bounded direct native
control: saved particles are cleared, their source is disabled during the child
scene, and enabled again on restoration. This does not qualify arbitrary
particle/render scheduling or graphical application input.

A strict authored capture after 2400 ms retains a scrolling pixel failure. It
records equal program time but original scene time 2380 ms and native scene
time 2400 ms, with 342 differing pixels. It is an explicit timing TODO, alongside
initial and resumed scene frame phases;
static presentation or retained source identity does not establish scrolling
timing parity. Concurrent Boolean questions and native text dialogs, generic
scene replacement during asynchronous creation, and actual hosted GUI input
remain outside these controls.
