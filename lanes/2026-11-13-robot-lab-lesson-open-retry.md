# Robot Lab lesson open retry

Status: CLAIMED.

Correct the lesson panel's error message and retry action when opening a model and program fails. Lesson loading failures must continue to retry the lesson; model-opening failures must retry the model and program.

Scope: `overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-lesson.jsx` and focused tests. Preserve the existing lesson loader, model-loading behavior, and cancellation handling.
