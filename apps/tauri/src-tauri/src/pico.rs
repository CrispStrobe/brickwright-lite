//! Pico deploy — the two things the webview cannot do for an RP2040 on USB.
//!
//! 1. SERIAL — a class-compliant CDC port to a MicroPython Pico. The JS side
//!    drives the same transport-agnostic picoRepl raw-REPL protocol the web
//!    build uses over WebSerial; here the transport is these four commands.
//!    No drivers on any OS.
//! 2. BOOTSEL — a desktop app has a filesystem, so first-time flashing is
//!    just writing the UF2 onto the RPI-RP2 volume the bootrom mounts. No
//!    USB protocol, no PICOBOOT: the same drag-and-drop a person does by
//!    hand, performed by a Flash button.
//!
//! Desktop-only: phones have no USB-CDC host stack we can reach, so the
//! mobile builds get honest "not on this platform" errors instead of a
//! serialport crate that does not compile there.

#[cfg(desktop)]
mod imp {
    use base64::Engine;
    use serialport::SerialPort;
    use std::io::{Read, Write};
    use std::sync::Mutex;
    use std::time::Duration;
    use tauri::State;

    pub struct PicoSerial(pub Mutex<Option<Box<dyn SerialPort>>>);

    #[tauri::command]
    pub fn pico_serial_list() -> Vec<String> {
        serialport::available_ports()
            .map(|ports| {
                ports
                    .into_iter()
                    .map(|p| p.port_name)
                    // macOS: prefer the callout device; never the tty node
                    .filter(|n| !n.starts_with("/dev/tty."))
                    .collect()
            })
            .unwrap_or_default()
    }

    #[tauri::command]
    pub fn pico_serial_open(
        state: State<PicoSerial>,
        path: String,
        baud: Option<u32>,
    ) -> Result<(), String> {
        let port = serialport::new(&path, baud.unwrap_or(115_200))
            .timeout(Duration::from_millis(50))
            .open()
            .map_err(|e| format!("open {path}: {e}"))?;
        *state.0.lock().unwrap() = Some(port);
        Ok(())
    }

    #[tauri::command]
    pub fn pico_serial_write(state: State<PicoSerial>, data: String) -> Result<(), String> {
        let mut guard = state.0.lock().unwrap();
        let port = guard.as_mut().ok_or("no port open")?;
        port.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        port.flush().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn pico_serial_read(state: State<PicoSerial>) -> Result<String, String> {
        let mut guard = state.0.lock().unwrap();
        let port = guard.as_mut().ok_or("no port open")?;
        let mut buf = [0u8; 4096];
        match port.read(&mut buf) {
            Ok(n) => Ok(String::from_utf8_lossy(&buf[..n]).into_owned()),
            // a read timeout is "nothing yet", not an error — the protocol
            // layer polls
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => Ok(String::new()),
            Err(e) => Err(e.to_string()),
        }
    }

    #[tauri::command]
    pub fn pico_serial_close(state: State<PicoSerial>) {
        *state.0.lock().unwrap() = None;
    }

    /// Directories a BOOTSEL Pico's fake drive can appear under, per OS.
    fn bootsel_roots() -> Vec<std::path::PathBuf> {
        let mut roots = Vec::new();
        #[cfg(target_os = "macos")]
        roots.push(std::path::PathBuf::from("/Volumes"));
        #[cfg(target_os = "linux")]
        {
            if let Some(user) = std::env::var_os("USER") {
                roots.push(std::path::PathBuf::from("/media").join(&user));
                roots.push(std::path::PathBuf::from("/run/media").join(&user));
            }
            roots.push(std::path::PathBuf::from("/media"));
        }
        #[cfg(target_os = "windows")]
        for letter in b'D'..=b'Z' {
            roots.push(std::path::PathBuf::from(format!("{}:\\", letter as char)));
        }
        roots
    }

    fn find_bootsel_in(roots: &[std::path::PathBuf]) -> Option<std::path::PathBuf> {
        for root in roots {
            // Windows drive letters ARE the volume; elsewhere volumes are
            // children of the root.
            let candidates: Vec<std::path::PathBuf> =
                if root.to_string_lossy().ends_with(":\\") {
                    vec![root.clone()]
                } else {
                    std::fs::read_dir(root)
                        .map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.path()).collect())
                        .unwrap_or_default()
                };
            for c in candidates {
                let info = c.join("INFO_UF2.TXT");
                if let Ok(text) = std::fs::read_to_string(&info) {
                    if text.contains("RPI-RP2") || text.contains("UF2 Bootloader") {
                        return Some(c);
                    }
                }
            }
        }
        None
    }

    #[tauri::command]
    pub fn pico_bootsel_volume() -> Option<String> {
        find_bootsel_in(&bootsel_roots()).map(|p| p.to_string_lossy().into_owned())
    }

    #[tauri::command]
    pub fn pico_flash_uf2(uf2_base64: String) -> Result<String, String> {
        let volume = find_bootsel_in(&bootsel_roots())
            .ok_or("no BOOTSEL Pico found — hold BOOTSEL while plugging in")?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(uf2_base64)
            .map_err(|e| format!("bad payload: {e}"))?;
        let target = volume.join("firmware.uf2");
        std::fs::write(&target, &bytes).map_err(|e| format!("write {}: {e}", target.display()))?;
        Ok(format!("{} bytes written to {}", bytes.len(), volume.display()))
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn bootsel_detection_reads_the_info_file() {
            let dir = std::env::temp_dir().join(format!("bw-bootsel-{}", std::process::id()));
            let vol = dir.join("RPI-RP2");
            std::fs::create_dir_all(&vol).unwrap();
            std::fs::write(
                vol.join("INFO_UF2.TXT"),
                "UF2 Bootloader v2.0\nModel: Raspberry Pi RP2\nBoard-ID: RPI-RP2\n",
            )
            .unwrap();
            let found = find_bootsel_in(&[dir.clone()]);
            assert_eq!(found, Some(vol));
            std::fs::remove_dir_all(&dir).ok();
        }

        #[test]
        fn no_volume_is_none_not_panic() {
            let dir = std::env::temp_dir().join(format!("bw-none-{}", std::process::id()));
            std::fs::create_dir_all(&dir).unwrap();
            assert_eq!(find_bootsel_in(&[dir.clone()]), None);
            std::fs::remove_dir_all(&dir).ok();
        }
    }
}

#[cfg(desktop)]
pub use imp::*;

// Mobile: same command names, honest refusals — the JS side probes
// pico_serial_list and shows/hides the deploy UI on the answer.
#[cfg(mobile)]
mod imp {
    #[tauri::command]
    pub fn pico_serial_list() -> Vec<String> {
        Vec::new()
    }

    #[tauri::command]
    pub fn pico_serial_open(_path: String, _baud: Option<u32>) -> Result<(), String> {
        Err("USB serial is desktop-only".into())
    }

    #[tauri::command]
    pub fn pico_serial_write(_data: String) -> Result<(), String> {
        Err("USB serial is desktop-only".into())
    }

    #[tauri::command]
    pub fn pico_serial_read() -> Result<String, String> {
        Err("USB serial is desktop-only".into())
    }

    #[tauri::command]
    pub fn pico_serial_close() {}

    #[tauri::command]
    pub fn pico_bootsel_volume() -> Option<String> {
        None
    }

    #[tauri::command]
    pub fn pico_flash_uf2(_uf2_base64: String) -> Result<String, String> {
        Err("BOOTSEL flashing is desktop-only".into())
    }
}

#[cfg(mobile)]
pub use imp::*;
