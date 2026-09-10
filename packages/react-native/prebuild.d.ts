export interface RetainedExpoPrebuildOptions {
  /** Consuming Expo app with installed native dependencies and a retained config plugin. */
  projectRoot?: string;
  platform: 'ios' | 'android';
  /** Discard native build caches; preserve unrelated consumer files. Dependencies are never installed. */
  clean?: boolean;
}

/** Generate the retained template, run Expo prebuild, and validate its native owner and original registrations. */
export declare function prebuildRetainedExpo(options: RetainedExpoPrebuildOptions): Promise<{
  project: string;
  changed: boolean;
  log: string;
  activity?: string;
  target?: string;
  workspace?: string;
  minimumOsVersion?: string;
  main?: string;
}>;
