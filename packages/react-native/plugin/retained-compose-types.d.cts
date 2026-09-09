export interface AndroidCompositionOptions {
  /** Complete immutable format 2 Android export. */
  artifactsDir: string;
  /** Generated consumer directory, separate from the input and renderer sources. */
  outputDir: string;
  /** Consumer JS project with installed React Native/codegen 0.86.3. */
  rendererDir: string;
  moduleName: string;
  /** Existing offline Metro bundle, produced by the consumer. */
  bundleFile: string;
}
/** Stage and generate the original Tauri project plus package-owned RN attachment. */
export function composeAndroid(options: AndroidCompositionOptions): { project: string; activity: string; changed: boolean };
