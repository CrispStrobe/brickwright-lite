fn main() {
    // macOS Bluetooth-Classic (RFCOMM/SPP) backend: compile the IOBluetooth
    // Objective-C shim and link the frameworks it needs. Only for the macOS
    // target (iOS BTC goes through ExternalAccessory instead).
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/scratchlink/bt_macos.m")
            .flag("-fobjc-arc")
            .compile("bt_macos");
        println!("cargo:rerun-if-changed=src/scratchlink/bt_macos.m");
        println!("cargo:rustc-link-lib=framework=IOBluetooth");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }

    tauri_build::build();
}
