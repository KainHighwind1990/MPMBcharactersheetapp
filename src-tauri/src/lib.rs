#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK can fail to repaint reliably under native Wayland on some
    // Linux graphics stacks. Tauri documents this as a supported workaround.
    // Set it before the webview is created so packaged builds work out of the box.
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running MPMB Character Sheet");
}
