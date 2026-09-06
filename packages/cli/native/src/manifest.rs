use std::path::Path;
use toml::Value;

pub fn prepare(source: &str, output: &Path) -> Result<(), String> {
    let mut manifest: Value = toml::from_str(source).map_err(|e| e.to_string())?;
    let table = manifest.as_table_mut().ok_or("expected Cargo manifest")?;
    let package = table
        .get_mut("package")
        .and_then(Value::as_table_mut)
        .ok_or("expected Cargo package")?;
    package.insert("build".into(), Value::Boolean(false));
    for key in ["autobins", "autoexamples", "autotests", "autobenches"] {
        package.insert(key.into(), Value::Boolean(false));
    }
    for key in ["bin", "example", "test", "bench", "dev-dependencies"] {
        table.remove(key);
    }
    let library = table
        .entry("lib")
        .or_insert_with(|| Value::Table(Default::default()))
        .as_table_mut()
        .ok_or("expected library table")?;
    library.insert(
        "crate-type".into(),
        Value::Array(
            ["staticlib", "cdylib", "rlib"]
                .map(|s| Value::String(s.into()))
                .to_vec(),
        ),
    );
    for key in ["dependencies", "build-dependencies"] {
        if let Some(dependencies) = table.get_mut(key).and_then(Value::as_table_mut) {
            dependencies.remove("tauri");
            dependencies.remove("tauri-build");
        }
    }
    let dependencies = table
        .entry("dependencies")
        .or_insert_with(|| Value::Table(Default::default()))
        .as_table_mut()
        .ok_or("expected dependencies")?;
    dependencies
        .entry("serde")
        .or_insert_with(|| Value::String("=1.0.229".into()));
    dependencies
        .entry("serde_json")
        .or_insert_with(|| Value::String("=1.0.151".into()));
    if let Some(features) = table.get_mut("features").and_then(Value::as_table_mut) {
        for feature in features
            .iter_mut()
            .filter_map(|(_, value)| value.as_array_mut())
        {
            feature.retain(|item| {
                !item.as_str().is_some_and(|s| {
                    s.starts_with("tauri/") || s.starts_with("tauri?/") || s == "dep:tauri"
                })
            });
        }
    }
    std::fs::write(
        output,
        toml::to_string_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
