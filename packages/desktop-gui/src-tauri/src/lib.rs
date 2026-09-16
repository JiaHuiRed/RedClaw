use std::process::{Command, Stdio};
use std::sync::Mutex;

use tauri::State;

/// GUI 托管的网关进程 PID。只记录 GUI 自己拉起的进程；
/// 用户在终端手动启动的网关不归 GUI 管（避免误杀）。
struct GatewayProc(Mutex<Option<u32>>);

#[cfg(windows)]
const DETACHED_PROCESS: u32 = 0x0000_0008;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

/// 后台拉起网关进程（`openclaw gateway` 前台模式，脱离 GUI 生命周期独立运行）。
/// 已有托管进程时直接返回其 PID，不重复拉起。
#[tauri::command]
fn gateway_spawn(state: State<GatewayProc>) -> Result<u32, String> {
    let mut held = state.0.lock().unwrap();
    if let Some(pid) = *held {
        return Ok(pid);
    }
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", "openclaw", "gateway"])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    let child = cmd.spawn().map_err(|e| format!("启动网关进程失败: {e}"))?;
    let pid = child.id();
    *held = Some(pid);
    Ok(pid)
}

/// 停止 GUI 托管的网关进程（taskkill 连带子进程树）。
/// 返回 false 表示当前没有 GUI 托管的网关（终端自启的不在此列）。
#[tauri::command]
fn gateway_stop(state: State<GatewayProc>) -> Result<bool, String> {
    let pid = state.0.lock().unwrap().take();
    let Some(pid) = pid else {
        return Ok(false);
    };
    let mut cmd = Command::new("taskkill");
    cmd.args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(DETACHED_PROCESS);
    }
    let ok = cmd
        .status()
        .map_err(|e| format!("停止网关失败: {e}"))?
        .success();
    Ok(ok)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(GatewayProc(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![gateway_spawn, gateway_stop])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
