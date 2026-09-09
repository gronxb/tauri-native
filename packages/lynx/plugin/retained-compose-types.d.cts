export interface AndroidCompositionOptions {
  /** Complete immutable format 2 Android export. */
  artifactsDir: string;
  /** Owned generated output, separate from the artifact, installed SDK and bundle. */
  outputDir: string;
  /** Existing offline Lynx bundle, produced by the consumer's normal toolchain. */
  bundleFile: string;
}
/** Generate the original Tauri project plus package-owned Lynx attachment without Rust. */
export function composeAndroid(options: AndroidCompositionOptions): { project: string; activity: string; changed: boolean };
