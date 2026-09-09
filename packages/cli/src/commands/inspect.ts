import { discoverProject } from '../discovery/project.ts';
import { DiscoveryError } from '../discovery/native-tool.ts';

export function inspectProject(options: { tauriDir: string; json?: boolean; runtime?: 'adapter' | 'retained' }): void {
  try {
    const project = discoverProject(options.tauriDir, process.cwd(), false, options.runtime);
    if (options.json) console.log(JSON.stringify(project, null, 2));
    else {
      console.log(`${project.package.name} → ${project.libraryName}\n${project.source}`);
      for (const command of project.commands) console.log(`  ${command.name}(${command.parameters.map(arg => `${arg.key}: ${arg.type}`).join(', ')}) → ${command.output}`);
      console.log(`Frontend: ${project.frontend.dist}\nABI: ${project.abiVersion}`);
    }
  } catch (error) {
    if (!options.json) throw error;
    console.log(JSON.stringify({ diagnostics: error instanceof DiscoveryError ? error.diagnostics : [{ file: options.tauriDir, message: error instanceof Error ? error.message : String(error) }] }, null, 2));
    process.exitCode = 1;
  }
}
