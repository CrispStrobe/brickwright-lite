// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//! Native owner only: no editor path, firmware fetch or emulator startup.
use crate::spike_local_image::{admit_dfu, admit_hex, admit_raw, AdmittedImage};
use std::fs::OpenOptions;
use std::io::Read;
use std::path::Path;
const MAX_INPUT: u64 = 4 * 1024 * 1024;

pub(crate) fn read_selected(path: &Path) -> Result<AdmittedImage, String> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let file = options
        .open(path)
        .map_err(|_| "Selected image is unavailable")?;
    let metadata = file
        .metadata()
        .map_err(|_| "Selected image is unavailable")?;
    if !metadata.is_file() || metadata.len() > MAX_INPUT {
        return Err("Selected image must be a bounded regular file".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_INPUT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Selected image could not be read")?;
    if bytes.len() as u64 > MAX_INPUT {
        return Err("Selected image exceeds its size limit".into());
    }
    let extension = path.extension();
    (if extension.is_some_and(|value| value.eq_ignore_ascii_case("hex")) {
        admit_hex(&bytes)
    } else if extension.is_some_and(|value| value.eq_ignore_ascii_case("dfu")) {
        admit_dfu(&bytes)
    } else {
        admit_raw(&bytes)
    })
    .map_err(|error| format!("Selected application refused: {error}"))
}

#[cfg(desktop)]
pub(crate) fn pick(app: &tauri::AppHandle) -> Result<Option<AdmittedImage>, String> {
    use tauri_plugin_dialog::DialogExt;
    let selected = app
        .dialog()
        .file()
        .set_title("Choose a local SPIKE MicroPython application")
        .add_filter("Application image", &["bin", "hex", "dfu"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "Selected image is unavailable")?;
    read_selected(&path).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (std::path::PathBuf, Vec<u8>) {
        let mut random = [0u8; 16];
        getrandom::getrandom(&mut random).unwrap();
        let path = std::env::temp_dir().join(format!("bw-selected-{:x?}.bin", random));
        let mut bytes = 0x2005_0000u32.to_le_bytes().to_vec();
        bytes.extend_from_slice(&0x0801_0009u32.to_le_bytes());
        bytes.extend_from_slice(&[0x70, 0x47]);
        (path, bytes)
    }
    #[test]
    fn admission_keeps_bytes_after_the_selected_file_is_deleted() {
        let (path, bytes) = fixture();
        std::fs::write(&path, &bytes).unwrap();
        let admitted = read_selected(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        assert_eq!(admitted.bytes, bytes);
        assert_eq!(admitted.load_address, 0x0801_0000);
    }
    #[test]
    fn selected_hex_is_canonicalized_instead_of_loading_text_as_flash() {
        let (path, bytes) = fixture();
        let path = path.with_extension("HEX");
        std::fs::write(
            &path,
            b":020000040801F1\n:0A0000000000052009000108704708\n:00000001FF\n",
        )
        .unwrap();
        let admitted = read_selected(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        assert_eq!(admitted.bytes, bytes);
    }
    #[test]
    fn selected_dfu_is_canonicalized_and_corruption_is_refused() {
        let (path, bytes) = fixture();
        let path = path.with_extension("DFU");
        let mut container = crate::spike_local_image::tests::fixture_dfu(&bytes);
        std::fs::write(&path, &container).unwrap();
        assert_eq!(read_selected(&path).unwrap(), admit_raw(&bytes).unwrap());
        container[293] ^= 1;
        std::fs::write(&path, &container).unwrap();
        let error = read_selected(&path).unwrap_err();
        assert!(error.contains("CRC"));
        assert!(!error.contains(path.to_str().unwrap()));
        std::fs::remove_file(&path).unwrap();
    }
    #[test]
    fn malformed_oversized_missing_and_nonregular_inputs_are_refused() {
        let (path, _) = fixture();
        assert!(read_selected(&path).is_err());
        assert!(read_selected(&std::env::temp_dir()).is_err());
        std::fs::write(&path, b"not firmware").unwrap();
        assert!(read_selected(&path).is_err());
        let file = OpenOptions::new().write(true).open(&path).unwrap();
        file.set_len(MAX_INPUT + 1).unwrap();
        assert!(read_selected(&path).is_err());
        std::fs::remove_file(&path).unwrap();
    }
}
