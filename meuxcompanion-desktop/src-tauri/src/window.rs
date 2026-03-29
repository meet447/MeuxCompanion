use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn create_mini_widget(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window("mini").is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("index.html?mode=mini".into()))
        .title("MeuxCompanion")
        .inner_size(200.0, 300.0)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e: tauri::Error| e.to_string())?;
    Ok(())
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn close_mini_widget(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("mini") {
        let _ = window.close();
    }
}

#[tauri::command]
pub fn window_toggle_mini(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("mini").is_some() {
        close_mini_widget(&app);
        show_main_window(&app);
    } else {
        hide_main_window(&app);
        create_mini_widget(&app)?;
    }
    Ok(())
}

#[tauri::command]
pub fn window_expand(app: AppHandle) -> Result<(), String> {
    close_mini_widget(&app);
    show_main_window(&app);
    Ok(())
}

pub fn cycle_window_state(app: &AppHandle) {
    let main_visible = app
        .get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);
    let mini_exists = app.get_webview_window("mini").is_some();

    if main_visible {
        hide_main_window(app);
        let _ = create_mini_widget(app);
    } else if mini_exists {
        close_mini_widget(app);
    } else {
        show_main_window(app);
    }
}
