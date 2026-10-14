# Browser verification

BrickWright Lite has two complementary browser checks:

- `verify-gui` drives Chromium against the deployed site. CI runs it.
- `npm run probe:layout -- --report` drives Firefox against a local production
  build in `packages/scratch-gui/build`. It is a manual layout diagnostic and
  requires Playwright's Firefox browser.

One browser passing does not establish that the other works. The deployed app
previously booted in Chromium while hanging during project load in Firefox:
Firefox did not settle `decodeAudioData` while its `AudioContext` was suspended.
`lib/audio-context-unblock.js` now resumes the context and bounds every decode;
Scratch Audio already degrades a rejected decode to an empty sound. The wrapper
must keep exactly one declared parameter because `AudioEngine` selects the
promise form of `decodeAudioData` by reading the function's `length` property.
The regression gate is `test/audio-context-unblock.test.mjs`.

Before `probe:layout` measures the editor, it must close the starter-journeys
modal and open the right pane when `[data-right-pane-toggle]` does not report
`aria-pressed="true"`. Editor tabs use `[class*="gui_tab_"]`; the broader
`[class*="gui_tab"]` also matches the tab panel, while `getByRole('tab')` alone
also finds debugger-solo-pane tabs.

Vercel is not part of per-push browser verification. `vercel.json` disables
Git-triggered deployments; production deploys only through the manual/nightly
workflow in `.github/workflows/deploy-daily.yml`.
