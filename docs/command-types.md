# Generated host command contracts

New generated exports include `commands.ts` beside `commands.json`. The artifact manifest identifies it as `bindings` and includes its checksum. Copy the complete platform directory so the types, frontend and native binary describe the same application. Older artifacts and the explicit legacy route retain the untyped host API.

The file exports a `Commands` map, `typeDiagnostics`, and `createCommands`. Connect it to either host package's `invoke`; no producer dependency, derive, schema or second registry is required:

```ts
import { invoke } from '@tauri-native/react-native'; // or @tauri-native/lynx
import { createCommands } from './Native Artifacts/commands';

const command = createCommands(invoke);
const request = command('describe', {
  request: { displayName: 'Ada', values: [1, 2] },
});
const response = await request;
if (response.ok) console.log(response.value.total);
```

The example uses the ordinary acceptance fixture's registered commands. Your generated command names and payloads come from your own Rust registry. The returned request is the host SDK's original cancellable Promise; options, AbortSignal, domain errors and cancellation follow [ABI 2](adr/0005-async-request-sessions.md). A zero-argument command takes `{}`. Unit success is `null`. A `Result<T, E>` exposes `T` on success and `E | string` on failure, including the ABI's argument/serialization/panic errors. The ordinary Tauri frontend continues importing from `@tauri-apps/api/core`.

The parser adds type syntax, serde attributes, root definitions and explicit imports to the same command model used for dispatch. The projection handles the verified subset below; Rust still performs actual serialization and input validation.

| Rust/serde case | Generated contract |
| --- | --- |
| Strings, chars, booleans | `string` / `boolean`; Rust validates constraints such as character length. |
| Integers through 32 bits | `number`; Rust validates range and integrality. |
| `i64`, `u64`, 128-bit and pointer-sized integers | `unknown` plus a diagnostic. The existing JSON number transport can lose precision beyond JavaScript's exact integer range; generation does not convert it to bigint or string. |
| Floats | Numeric input; `number | null` output accounts for nonfinite JSON serialization. |
| `Option`, `Vec`, tuples, string-keyed maps, `Box` | Nullable values, arrays, tuples, records and the wrapped type. Missing Option arguments/fields are accepted on input. |
| Fixed arrays | Tuples for literal lengths through 32; other lengths are diagnosed as unknown. |
| Ordinary root serde structs | Separate input/output shapes; renamed fields, defaults, skip flags and optional serialized fields. Simple newtypes and one-field transparent wrappers are supported. |
| Ordinary root serde enums | External, internal and adjacent tags, or untagged unions; internal newtype variants remain unknown. Field and variant rename rules are distinct. |
| Explicit standard-library imports, including renamed Result | Resolved without a producer annotation. |
| Custom serializers/derives, opaque external types, recursive/generic definitions, unsupported serde attributes | The affected projection is `unknown`, with a command, location and source line diagnostic. Valid untyped export remains available. |

Unsupported attributes include flattening, aliases, conversion serializers and custom field serializers. Generated inputs describe the supported canonical forms, not every alternate form Serde may accept. The projection does not claim arbitrary macro/type resolution or exhaustive static serde analysis. Consult `typeDiagnostics` before relying on a contract. See Serde's [container attributes](https://serde.rs/container-attrs.html), [field attributes](https://serde.rs/field-attrs.html) and [enum representations](https://serde.rs/enum-representations.html) for the serialization rules.

## Verification

With the documented macOS, Xcode, Android NDK and Rust targets installed, run:

```sh
nub --cwd packages/cli run test:types
```

The gate builds an ordinary producer, compares actual Tauri IPC with its generated native ABI, and checks observed JSON against the generated types. It exports every iOS/Android slice, deletes the producer, installs packed RN/Lynx SDKs in independent consumers and compiles valid and deliberately invalid calls using each copied artifact. Registration changes regenerate the callable contract; empty registries compile as well. Consumer validation/typechecking runs without Cargo or rustc on PATH. Evidence is written to `target/command-types/report.json` only after all checks pass. This gate does not replace the native lifecycle tests, and does not claim new physical-device or external-adoption evidence.

Verified on 2026-09-07: all seventeen Tauri/native samples and all four packed-host/platform contract checks pass, with unchanged producer hashes. CLI 33, RN 9 and Lynx 2 tests, package/type checks and the Rust protocol scenario also pass.
