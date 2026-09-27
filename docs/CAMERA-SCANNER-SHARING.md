# Camera, scanner, and sharing support

The **Camera Capture** extension uses the editor's shared camera stream. It asks
for camera access only when a project runs a start/select block; listing devices
does not trigger permission. Device labels become available after consent.

## Capture support

| Host | RGB | Camera choice | Controls | Depth |
|---|---|---|---|---|
| iPhone/iPad browser or installed app | front/rear | cameras exposed by WebKit | zoom, focus, exposure, torch when WebKit reports them | calibrated scene depth in the installed app on ARKit LiDAR devices |
| macOS browser, PWA, or installed app | built-in and UVC USB webcams | explicit device, requested width/height/FPS, hot-plug fallback | only capabilities reported by the selected camera/browser | RGB-only for ordinary webcams |
| other desktop browsers | built-in and UVC USB webcams | browser-dependent enumeration and selection | browser/driver-dependent | RGB-only |

Depth is never inferred from one RGB frame. A depth scan frame contains a JPEG
captured by the same ARKit frame as its Float32 little-endian depth map (metres),
optional confidence bytes, camera intrinsics, world pose, dimensions, and
timestamp. Unsupported devices report `RGB only`. A vendor-specific USB depth
camera needs its vendor SDK and a future native adapter; a normal USB webcam is
not an RGB-D device.

Starting ARKit depth capture stops the Web camera first because iOS does not let
both sessions own the camera. The ordinary camera and depth camera each have an
explicit stop block and are also released when the project stops.

## Keeping scans and photos

`begin scan session` creates storage lazily. Frames are kept in IndexedDB (with
an in-memory fallback), capped at 500 frames and 512 MiB per session. A
`.bwscan.zip` contains `manifest.json`, numbered RGB images, and optional packed
depth/confidence files. Archives can be reopened with `open scan archive`; names,
counts, paths, versions, and aggregate size are validated.

The last photo can be added directly to the current sprite as a costume or sent
through the common artifact sharing route. Scan data is not put in the Photos
library automatically, so the app requests no Photos permission.

## Sharing projects, code, firmware, photos, and scans

All generated artifacts use one route:

- supporting browsers/PWAs use the Web Share sheet, with download as fallback;
- iPhone/iPad installed apps use the system share sheet (including AirDrop and
  LocalSend when installed as a share target);
- the macOS app uses `NSSharingServicePicker`, which similarly exposes AirDrop
  and installed services, and falls back to Save As;
- other desktop apps use Save As.

The installed app can also serve one selected scan archive on the local network.
The address contains a random token, accepts only an exact `GET`, exposes no
directory or upload route, sends `no-store`, and expires after 1–30 minutes or
when stopped. iOS explains the local-network request in its privacy prompt. The
server is for short-lived transfer on a trusted LAN, not Internet publishing.

GitHub Pages receives the browser feature after the normal main build/deploy.
Vercel receives it through the repository's daily/manual deployment workflow.
Native share sheets, the LAN server, and ARKit depth require an installed build;
they cannot run in a hosted web page.
