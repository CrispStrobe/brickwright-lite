fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    // macOS Bluetooth-Classic (RFCOMM/SPP) backend: compile the IOBluetooth
    // Objective-C shim and link the frameworks it needs. iOS BTC goes through
    // ExternalAccessory instead (not this shim).
    if target_os == "macos" {
        cc::Build::new()
            .file("src/scratchlink/bt_macos.m")
            .flag("-fobjc-arc")
            .compile("bt_macos");
        println!("cargo:rerun-if-changed=src/scratchlink/bt_macos.m");
        println!("cargo:rustc-link-lib=framework=IOBluetooth");
        println!("cargo:rustc-link-lib=framework=Foundation");
    } else if target_os == "ios" {
        // iOS BTC via MFi ExternalAccessory (EV3/NXT).
        cc::Build::new()
            .file("src/scratchlink/bt_ios.m")
            .flag("-fobjc-arc")
            .compile("bt_ios");
        println!("cargo:rerun-if-changed=src/scratchlink/bt_ios.m");
        // btleplug (via tauri-plugin-blec) uses CoreBluetooth for BLE on iOS but
        // doesn't emit the framework link directive there, so link it explicitly.
        println!("cargo:rustc-link-lib=framework=CoreBluetooth");
        println!("cargo:rustc-link-lib=framework=ExternalAccessory");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }

    tauri_build::build();
}
