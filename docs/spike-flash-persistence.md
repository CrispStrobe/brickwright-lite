# Saved programs in the desktop SPIKE simulator

New own NuttX packages declare `hostFlashCheckpointAbi: 1` in their verified state configuration. The desktop launcher enables `nuttx-flash-checkpoint/v1` only for these packages when its native application data store is configured. Older packages retain their existing session-only Save/Load behaviour.

An explicit Save has two stages: the firmware completes its LittleFS operation, then the native host retains a checkpoint of the actual 32 MiB external flash. The GUI waits for both stages. Flash is restored before firmware boot and LittleFS mounting. A fresh firmware process still starts with an EMPTY resident program; Load produces READY, and Run remains explicit.

The default and six-motor profiles share a store keyed by the verified own firmware image SHA-256. Changing images selects another store. Persistence covers the last completed explicit Save, including the filesystem bytes present at that point. Later filesystem writes are not promised to survive closing the process.

## Host contract

The application supplies `app_data_dir()/spike-flash-v1` through a native-only setter. No editor, project, broker request, or package configuration can choose a storage path. An exclusive operating-system file lock owns an image store through emulator termination and checkpoint-worker cleanup. A second owner receives a busy error.

Each journal has two raw flash slots with binary integrity records containing the image identity, generation, byte count, payload SHA-256, and record checksum. A commit writes and syncs a staging payload and record, replaces the inactive slot, and syncs the directory before acknowledging durability. The previous committed slot remains intact. A missing journal uses the packaged empty flash seed. An existing journal with no valid generation fails startup. A damaged newer slot with an intact older generation also stops startup with an explicit recovery message; automatic recovery is not enabled.

Persistent slots require about 64 MiB per saved image. An active restore/export/commit can raise disk use to about 160 MiB per image, excluding emulator assets. Session staging files are removed after the owned process and worker finish. Crashes may leave private staging directories; they never substitute for committed journal data.

A native-created private job directory is passed to the pinned monitor service through a fixed environment variable. The service exports only after the exact successful SAVE mailbox sequence and program ID. Native code validates the fixed export metadata and full flash length, commits the journal, and writes a matching durable/failed receipt. Neither paths nor raw monitor commands cross the broker. New program packets are refused during a checkpoint; state sampling remains available. A failed or uncertain checkpoint requires closing the session before further program writes.

The existing two-second RPC, 30-second storage-job, 60-second startup and 120-second process limits remain unchanged. Firmware acknowledgement alone does not establish host durability. Interrupted operations may have an unknown result; the GUI never retries a Save automatically.

## Validation and limits

Reproducible source checks:

```sh
node --test test/spike-nuttx-storage-exchange.test.mjs
cargo test --manifest-path apps/tauri/src-tauri/Cargo.toml spike_flash_store -- --test-threads=1
```

The paired Renode repository supplies `tests/tools/spike_flash_checkpoint_test.py` and `tests/tools/spike_state_monitor_protocol_test.py`. The opt-in native test `packaged_spike_nuttx_flash_survives_close_and_profile_change_without_autorun` requires the privately staged own package, synthetic caller fixtures, and a fresh `BW_NUTTX_TEST_FLASH_ROOT`; it exercises two actual emulator boots.

Local qualification passed that two-boot test with six-motor Save followed by default-profile restore, EMPTY before Load, READY without autorun, and explicit execution after Load. The current production GUI build and 17 storage/browser-contract tests passed. The actual managed ARM guest browser test passed shared arena motion, distance sensing, wall stall, cancellation and return to native sandbox driving. Full NuttX browser tests remain under investigation: successful boot snapshots were followed by a debugger continue-handshake failure. These browser runs use an injected closed transport into the production native policy and debugger, rather than an installed Tauri WebView.

Generated packages, flash files, execution receipts, transcripts and result JSON belong in private evidence storage. They are not public repository assets.

Linux filesystem and lock behaviour is the local qualification target. Windows directory flushing and installed desktop WebView behaviour require separate qualification; source tests do not establish those properties. This integration reuses the retained firmware and simulator infrastructure with their required attribution. It makes no cleanroom or physical-hardware equivalence claim.
