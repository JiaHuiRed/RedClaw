use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::State;

/// GUI 托管的网关进程句柄（Child 用于 try_wait 查活）。只记录 GUI 自己拉起的进程；
/// 用户在终端手动启动的网关不归 GUI 管（避免误杀）。
struct GatewayProc(Mutex<Option<Child>>);

#[cfg(windows)]
const DETACHED_PROCESS: u32 = 0x0000_0008;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

/// 后台拉起网关进程（`openclaw gateway` 前台模式，脱离 GUI 生命周期独立运行）。
/// 已有托管进程且仍在运行时返回其 PID 不重复拉起；已退出（崩溃/被手动杀）则清槽重拉。
#[tauri::command]
fn gateway_spawn(state: State<GatewayProc>) -> Result<u32, String> {
    let mut held = state.0.lock().unwrap();
    if let Some(child) = held.as_mut() {
        match child.try_wait() {
            // 存活或状态未知：复用；确认已退出则落下去清槽重拉
            Ok(None) | Err(_) => return Ok(child.id()),
            Ok(Some(_)) => {}
        }
    }
    *held = None;
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
    *held = Some(child);
    Ok(pid)
}

/// 停止 GUI 托管的网关进程（taskkill 连带子进程树）。
/// 返回 false 表示当前没有 GUI 托管的网关（终端自启的不在此列）；
/// 托管进程已自行退出时按已停止上报（顺带清槽）。
#[tauri::command]
fn gateway_stop(state: State<GatewayProc>) -> Result<bool, String> {
    let child = state.0.lock().unwrap().take();
    let Some(mut child) = child else {
        return Ok(false);
    };
    // 已退出的进程 taskkill 必然失败（前端会误报"非 GUI 启动"），但停止目标已达成
    if matches!(child.try_wait(), Ok(Some(_))) {
        return Ok(true);
    }
    let pid = child.id();
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
