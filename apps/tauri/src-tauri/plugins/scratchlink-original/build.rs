// Command names must match the @objc methods in
// ios/Sources/ScratchLinkOriginal/ScratchLinkOriginalPlugin.swift — Tauri
// bridges them by name, so a mismatch fails at RUNTIME, not at build.
const COMMANDS: &[&str] = &["openSession", "sendFrame", "closeSession"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
