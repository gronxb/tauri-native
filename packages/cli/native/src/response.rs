// Autoref dispatch lets Rust select Result semantics even when the producer
// imports Result under another name. Source spelling is not a type resolver.
struct __TauriNativeValue;
struct __TauriNativeResult;

trait __TauriNativeValueKind {
    fn __tauri_native_kind(&self) -> __TauriNativeValue { __TauriNativeValue }
}
impl<T: serde::Serialize> __TauriNativeValueKind for &T {}

trait __TauriNativeResultKind {
    fn __tauri_native_kind(&self) -> __TauriNativeResult { __TauriNativeResult }
}
impl<T: serde::Serialize, E: serde::Serialize> __TauriNativeResultKind for Result<T, E> {}

impl __TauriNativeValue {
    fn serialize<T: serde::Serialize>(self, value: T) -> Result<serde_json::Value, serde_json::Value> {
        serde_json::to_value(value).map_err(|e| serde_json::Value::String(e.to_string()))
    }
}

impl __TauriNativeResult {
    fn serialize<T: serde::Serialize, E: serde::Serialize>(self, value: Result<T, E>) -> Result<serde_json::Value, serde_json::Value> {
        match value {
            Ok(value) => __TauriNativeValue.serialize(value),
            Err(error) => Err(__TauriNativeValue.serialize(error)?),
        }
    }
}
