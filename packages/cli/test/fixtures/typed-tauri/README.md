# Ordinary command typing fixture

Overlay this directory on `standard-tauri` before establishing the source-integrity baseline. The commands use ordinary serde derives and Tauri registration. They exercise distinct input/output names, default/optional fields, tagged enums, tuples, fixed arrays, maps, transparent wrappers and Result errors. Custom serialization and 64-bit integers remain valid untyped exports with explicit typing diagnostics.

`test:types` compares the generated native ABI with real Tauri IPC, checks native JSON against generated TypeScript, exports portable artifacts and compiles independent packed RN/Lynx consumers after deleting the producer. No schema or bridge-specific annotation is added to this application.
