# Android document picker patch

This is `tauri-plugin-dialog` 2.7.1, vendored under its upstream MIT/Apache-2.0 licenses. Brickwright changes only `android/src/main/java/DialogPlugin.kt`.

The upstream Android Open picker uses `ACTION_GET_CONTENT`. That grants temporary read access and cannot reliably save a project back to its provider. Brickwright uses `ACTION_OPEN_DOCUMENT`, requests read/write/persistable URI grants, and takes the grants returned by the provider. The Create Document picker likewise retains its returned grant. Providers that do not allow persistence still work for the current app session.

Review this patch when updating the plugin; remove it if upstream adopts an equivalent document mode.
