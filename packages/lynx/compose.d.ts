export interface AndroidCompositionOptions {
  /** Complete immutable format 2 platform export. */
  artifactsDir: string;
  /** Owned generated output, separate from the artifact, installed SDK and bundle. */
  outputDir: string;
  /** Existing offline Lynx bundle, produced by the consumer's normal toolchain. */
  bundleFile: string;
}
/** Generate the original Tauri project plus package-owned Lynx attachment without Rust. */
export function composeAndroid(options: AndroidCompositionOptions): { project: string; activity: string; changed: boolean };

export interface IosCompositionOptions extends AndroidCompositionOptions {}
/** macOS: generate the original Tauri Xcode app and Lynx/CocoaPods integration without Rust. */
export function composeIos(options: IosCompositionOptions): { project: string; target: string; workspace: string; minimumOsVersion: string; changed: boolean };
