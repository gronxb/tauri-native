export interface AndroidCompositionOptions {
  /** Complete immutable format 2 platform export. */
  artifactsDir: string;
  /** Generated consumer directory, separate from the input and renderer sources. */
  outputDir: string;
  /** Consumer JS project with installed React Native/codegen 0.86.3. */
  rendererDir: string;
  moduleName: string;
  /** Existing offline Metro bundle, produced by the consumer. */
  bundleFile: string;
  /** Link installed Expo SDK 57 native modules and RN dependencies in the generated consumer. */
  expo?: boolean;
}
/** Stage and generate the original Tauri project plus package-owned RN attachment. */
export function composeAndroid(options: AndroidCompositionOptions): { project: string; activity: string; changed: boolean };

export interface IosCompositionOptions extends AndroidCompositionOptions {}
/** macOS: validate the original Xcode app and generate its RN/CocoaPods integration without Rust. */
export function composeIos(options: IosCompositionOptions): { project: string; target: string; workspace: string; minimumOsVersion: string; changed: boolean };
