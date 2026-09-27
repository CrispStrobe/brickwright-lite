const COMMANDS: &[&str] = &["status", "start", "capture", "stop"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
