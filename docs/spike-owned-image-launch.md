# Owned image lifetime during native Renode launch

The native supervisor has an internal `start_with_owned_image` seam. Only a native
profile builder supplies its fixed arguments, working directory and staged image.
No webview or broker operation can call it directly. The packaged Renode executable
and its digest remain build pins, and existing process, output and time bounds apply.

The staged image is reverified immediately before spawn. The process worker takes
ownership and drops it after child reaping and output-reader completion, before
signalling that cleanup finished. A teardown timeout cannot drop the image early;
the worker retains ownership independently of the supervisor session slot. Failed
verification refuses the launch and cleans the consumed capsule.

Tests exercise reset, project close, app exit, automatic timeout, output-limit
termination, normal child exit and changed-image refusal. A compiled mutation
removing worker ownership fails the lifetime test. The offline suite includes
image admission, staging, supervisor, policy, debugger, shared feed and RSP tests;
package-dependent tests remain ignored. Complete fixtures, mutation output and
transcripts remain private. No actual firmware boot or desktop GUI launch is
claimed by these process tests.

This is a native ownership prerequisite. A pinned MicroPython profile package,
owned configuration lifetime, native file chooser, debugger attachment and GUI
backend selection remain pending. Existing guest and NuttX launchers use the same
supervisor with no local-image capsule. Non-Unix staging still fails closed.
