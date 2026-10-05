# Project files across devices

Brickwright Lite stores a project as one `.sb3` file. The file includes the Scratch stage and blocks, plus Brickwright Code, Circuit and Widgets state. Keep that file in a folder provided by iCloud Drive, OneDrive, Google Drive, Dropbox, Syncthing or another file provider to sync it between devices. Brickwright does not require an account or host a copy.

## Open and save

- **File → Open** selects a `.sb3` or `.sb2` using the system document picker. Opening an associated `.sb3` from Files, Explorer or Finder uses the same loader.
- **File → Save project** writes to the open document. The first save asks where to put it.
- Opening an older `.sb2` and choosing Save creates a `.sb3` document, leaving the original `.sb2` intact.
- **File → Save project as…** chooses a new document and makes it the current one.
- **File → Send a copy…** opens the mobile share sheet. Choose LocalSend to send to a nearby device, or choose Files to store a copy. On Windows and macOS it opens a Save dialog; give that exported copy to LocalSend. The current project document remains selected.
- **Recent** entries appear on desktop and Android for documents opened through the picker. The Android picker requests persistent read and write grants; if a provider revokes one, reopen the file from that provider. On iOS, reopen a file from Files because document URLs need security scoped bookmarks for reliable reopening across launches.

When a synced file changes on another device after you open it, Save detects the mismatch and offers a separate copy so neither version is silently overwritten. Before replacing a document, Brickwright keeps up to ten previous versions in its private app data folder under `project-versions`. A provider may also keep its own history; consult that provider for recovery after device loss.

For LocalSend, install it on both devices and keep both on the same network. Choose **Send a copy…** on the sender, then open the received `.sb3` in Brickwright on the receiver. The peer-session project transfer remains available for devices already paired in Brickwright.

Mobile and desktop documents are ordinary files. Moving one to a different provider or folder creates a new path; reopen it at the new location. Sync services can still produce their own conflict copies if both devices edit while offline.
