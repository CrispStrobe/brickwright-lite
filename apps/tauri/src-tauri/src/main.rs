// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // BSD-3-Clause desktop packaging addition, Copyright (c) 2026 Brickwright contributors.
    brickwright_tauri_lib::run_with_context(tauri::generate_context!());
}
