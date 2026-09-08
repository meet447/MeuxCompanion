#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    // WebKitGTK's DMA-BUF renderer often yields a blank WebGL canvas on Linux
    // (NVIDIA and software GL). See https://v2.tauri.app/develop/debug/linux-graphics/
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        #[allow(unused_unsafe)]
        // SAFETY: single-threaded main, before the webview or any worker starts.
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    meuxe_desktop::run();
}
