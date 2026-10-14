use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_depth_capture);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("depth-capture")
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            _api.register_ios_plugin(init_plugin_depth_capture)?;
            Ok(())
        })
        .build()
}
