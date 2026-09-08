fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().plugin(
        "runtime-probe",
        tauri_build::InlinedPlugin::new().commands(&["read", "forbidden"]),
    ))
    .expect("build runtime fixture permissions");
}
