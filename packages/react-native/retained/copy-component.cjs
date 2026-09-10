const { mkdirSync, copyFileSync } = require('node:fs');
const path = require('node:path');

// Like Bob's component specs, keep the TypeScript for Metro's codegen transform.
// This spec stays outside src so the format 1 codegen never registers it.
const output = path.join(__dirname, '../lib/retained/specs');
mkdirSync(output, { recursive: true });
copyFileSync(path.join(__dirname, 'specs/TauriRetainedViewNativeComponent.ts'), path.join(output, 'TauriRetainedViewNativeComponent.ts'));
