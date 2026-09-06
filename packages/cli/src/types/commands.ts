import type { SourceModel } from '../discovery/project.ts';

export type RustType = { path: string; args: RustType[] } | { tuple: RustType[] } | { reference: RustType } | { array: RustType; length: number | null } | { opaque: string };
type Attributes = Record<string, unknown>;
interface Fields { kind: 'named' | 'unnamed' | 'unit'; fields: { name: string | null; type: RustType; attributes: Attributes }[] }
interface Definition {
  kind: 'struct' | 'enum'; generic: boolean; derives: string[]; attributes: Attributes;
  body?: Fields; variants?: { name: string; attributes: Attributes; body: Fields }[];
}
export interface TypeGraph { definitions: Record<string, Definition>; imports: Record<string, string>; globImports: boolean }
type Direction = 'serialize' | 'deserialize';
interface TypeDiagnostic { command: string; location: string; message: string; line: number; column: number }

const quoted = JSON.stringify;
const object = (fields: string[]) => fields.length ? `{ ${fields.join('; ')} }` : 'Record<string, never>';
const asciiLower = (text: string) => text.replace(/[A-Z]/g, c => c.toLowerCase());
const asciiUpper = (text: string) => text.replace(/[a-z]/g, c => c.toUpperCase());

function setting(attrs: Attributes, key: string, direction: Direction): string | undefined {
  const value = attrs[key];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as Attributes)[direction] === 'string') return (value as Attributes)[direction] as string;
  return undefined;
}

// Serde treats field names and variant names differently, including acronyms.
function renamed(name: string, rule: string | undefined, variant: boolean): string {
  if (!rule) return name;
  if (!/^[\x00-\x7f]*$/.test(name)) throw new Error('non-ASCII rename_all requires a separate typing proof');
  const pascal = name.split('_').map(word => asciiUpper(word.slice(0, 1)) + word.slice(1)).join('');
  const snake = variant ? [...name].map((c, index) => /[A-Z]/.test(c) && index ? '_' + asciiLower(c) : asciiLower(c)).join('') : name;
  switch (rule) {
    case 'lowercase': return variant ? asciiLower(name) : name;
    case 'UPPERCASE': return asciiUpper(name);
    case 'PascalCase': return variant ? name : pascal;
    case 'camelCase': { const value = variant ? name : pascal; return asciiLower(value.slice(0, 1)) + value.slice(1); }
    case 'snake_case': return snake;
    case 'SCREAMING_SNAKE_CASE': return asciiUpper(snake);
    case 'kebab-case': return snake.replaceAll('_', '-');
    case 'SCREAMING-KEBAB-CASE': return asciiUpper(snake).replaceAll('_', '-');
    default: throw new Error(`unsupported serde rename_all: ${rule}`);
  }
}

function checkAttributes(attrs: Attributes, allowed: string[]) {
  const unsupported = Object.keys(attrs).filter(key => !allowed.includes(key));
  if (unsupported.length) throw new Error(`unsupported serde attributes: ${unsupported.join(', ')}`);
}

class Projection {
  readonly diagnostics: TypeDiagnostic[] = [];
  private readonly active = new Set<string>();
  private graph: TypeGraph;
  private command: SourceModel['commands'][number];
  constructor(graph: TypeGraph, command: SourceModel['commands'][number]) { this.graph = graph; this.command = command; }

  resolve(name: string): string {
    const seen = new Set<string>();
    while (!seen.has(name)) {
      seen.add(name);
      const [head, ...tail] = name.split('::');
      if (!Object.hasOwn(this.graph.imports, head!)) break;
      const replacement = [this.graph.imports[head!], ...tail].join('::');
      if (replacement === name) break;
      name = replacement;
    }
    return name.replace(/^(?:self|crate)::/, '');
  }

  builtin(type: RustType, kind: string): boolean {
    if (!('path' in type)) return false;
    const name = this.resolve(type.path);
    if (Object.hasOwn(this.graph.definitions, name)) return false;
    const canonical: Record<string, string[]> = {
      Option: ['std::option::Option', 'core::option::Option'], Result: ['std::result::Result', 'core::result::Result'],
      Vec: ['std::vec::Vec', 'alloc::vec::Vec'], String: ['std::string::String', 'alloc::string::String'],
      Box: ['std::boxed::Box', 'alloc::boxed::Box'],
      BTreeMap: ['std::collections::BTreeMap', 'std::collections::btree_map::BTreeMap'],
      HashMap: ['std::collections::HashMap', 'std::collections::hash_map::HashMap'],
    };
    return (name === kind && !this.graph.globImports) || (canonical[kind] ?? [`std::primitive::${kind}`, `core::primitive::${kind}`]).includes(name);
  }

  type(type: RustType | undefined, direction: Direction, location: string): string {
    try {
      if (!type) throw new Error('type syntax is absent from this older command model');
      return this.project(type, direction, location);
    } catch (error) {
      this.diagnostics.push({ command: this.command.name, location, message: (error as Error).message, line: this.command.line, column: this.command.column });
      return 'unknown';
    }
  }

  private project(type: RustType, direction: Direction, location: string): string {
    if ('reference' in type) return this.type(type.reference, direction, location);
    if ('tuple' in type) return type.tuple.length ? `[${type.tuple.map((t, i) => this.type(t, direction, `${location}[${i}]`)).join(', ')}]` : 'null';
    if ('array' in type) {
      if (type.length === null || type.length > 32) throw new Error('fixed arrays require a literal length of at most 32 for generated tuple types');
      return `[${Array.from({ length: type.length }, () => this.type(type.array, direction, `${location}[]`)).join(', ')}]`;
    }
    if ('opaque' in type) throw new Error(`opaque Rust syntax: ${type.opaque}`);
    const name = this.resolve(type.path);
    if (Object.hasOwn(this.graph.definitions, name)) {
      if (this.active.has(name)) throw new Error(`recursive type ${name} is not projected`);
      const definition = this.graph.definitions[name]!;
      if (type.args.length || definition.generic) throw new Error(`generic type ${name} is not projected`);
      if (!definition.derives.includes(direction === 'serialize' ? 'Serialize' : 'Deserialize')) throw new Error(`${name} has no ordinary serde ${direction} derive; custom implementations remain unknown`);
      this.active.add(name);
      try { return this.definition(definition, direction, location); }
      finally { this.active.delete(name); }
    }
    for (const kind of ['String', 'str', 'char']) if (this.builtin(type, kind)) return 'string';
    if (this.builtin(type, 'bool')) return 'boolean';
    for (const kind of ['u8', 'u16', 'u32', 'i8', 'i16', 'i32']) if (this.builtin(type, kind)) return 'number';
    for (const kind of ['u64', 'i64', 'u128', 'i128', 'usize', 'isize']) if (this.builtin(type, kind)) throw new Error(`${kind} can exceed JavaScript's exact integer range; JSON number transport is unchanged`);
    for (const kind of ['f32', 'f64']) if (this.builtin(type, kind)) return direction === 'serialize' ? '(number | null)' : 'number';
    const inner = () => this.type(type.args[0], direction, `${location}[]`);
    if (this.builtin(type, 'Option') && type.args.length === 1) return `(${inner()} | null)`;
    if (this.builtin(type, 'Vec') && type.args.length === 1) return `Array<${inner()}>`;
    if (this.builtin(type, 'Box') && type.args.length === 1) return inner();
    if ((this.builtin(type, 'BTreeMap') || this.builtin(type, 'HashMap')) && type.args.length === 2 && this.builtin(type.args[0]!, 'String')) return `Record<string, ${this.type(type.args[1], direction, `${location}.*`)}>`;
    throw new Error(`opaque or unsupported Rust type: ${type.path}`);
  }

  private fields(body: Fields, attrs: Attributes, direction: Direction, location: string): string {
    if (body.kind === 'unit') return 'null';
    if (body.kind === 'unnamed') {
      if (body.fields.some(f => Object.keys(f.attributes).length)) throw new Error('serde attributes on tuple/newtype fields are not projected');
      const values = body.fields.map((f, i) => this.type(f.type, direction, `${location}[${i}]`));
      return values.length === 1 ? values[0]! : `[${values.join(', ')}]`;
    }
    const values: string[] = [];
    for (const field of body.fields) {
      const a = field.attributes;
      checkAttributes(a, ['rename', 'default', 'skip', 'skip_serializing', 'skip_deserializing', 'skip_serializing_if']);
      if (a.skip || a[direction === 'serialize' ? 'skip_serializing' : 'skip_deserializing']) continue;
      const name = setting(a, 'rename', direction) ?? renamed(field.name!, setting(attrs, 'rename_all', direction), false);
      const optional = direction === 'serialize' ? !!a.skip_serializing_if : !!(a.default || attrs.default || this.builtin(field.type, 'Option'));
      values.push(`${quoted(name)}${optional ? '?' : ''}: ${this.type(field.type, direction, `${location}.${name}`)}`);
    }
    return object(values);
  }

  private definition(definition: Definition, direction: Direction, location: string): string {
    const a = definition.attributes;
    checkAttributes(a, ['rename', 'rename_all', 'rename_all_fields', 'deny_unknown_fields', 'default', 'tag', 'content', 'untagged', 'transparent']);
    if (definition.kind === 'struct') {
      if (a.tag || a.content || a.untagged || a.rename_all_fields) throw new Error('tagged struct typing is not supported');
      if (a.transparent) {
        if (definition.body!.fields.length !== 1 || Object.keys(definition.body!.fields[0]!.attributes).length) throw new Error('transparent typing requires one ordinary field');
        return this.type(definition.body!.fields[0]!.type, direction, location);
      }
      return this.fields(definition.body!, a, direction, location);
    }
    const variants: string[] = [];
    for (const variant of definition.variants!) {
      const v = variant.attributes;
      checkAttributes(v, ['rename', 'rename_all', 'skip', 'skip_serializing', 'skip_deserializing']);
      if (v.skip || v[direction === 'serialize' ? 'skip_serializing' : 'skip_deserializing']) continue;
      const name = setting(v, 'rename', direction) ?? renamed(variant.name, setting(a, 'rename_all', direction), true);
      const body = this.fields(variant.body, { rename_all: v.rename_all ?? a.rename_all_fields }, direction, `${location}.${name}`);
      if (a.untagged) variants.push(body);
      else if (typeof a.tag === 'string') {
        const tag = `${quoted(a.tag)}: ${quoted(name)}`;
        if (variant.body.kind === 'unit') variants.push(object([tag]));
        else if (typeof a.content === 'string') variants.push(object([tag, `${quoted(a.content)}: ${body}`]));
        else if (variant.body.kind === 'named') variants.push(body === 'Record<string, never>' ? object([tag]) : `(${object([tag])} & ${body})`);
        else throw new Error('internally tagged newtype variants are not projected');
      } else variants.push(variant.body.kind === 'unit' ? quoted(name) : object([`${quoted(name)}: ${body}`]));
    }
    return variants.length ? `(${variants.join(' | ')})` : 'never';
  }
}

export function generateCommands(model: SourceModel): string {
  const diagnostics: TypeDiagnostic[] = [];
  const contracts = model.commands.map(command => {
    const projection = new Projection(model.typeGraph ?? { definitions: {}, imports: {}, globImports: true }, command);
    const input = object(command.parameters.map(parameter => `${quoted(parameter.key)}${parameter.rustType && projection.builtin(parameter.rustType, 'Option') ? '?' : ''}: ${projection.type(parameter.rustType, 'deserialize', `input.${parameter.key}`)}`));
    const output = command.rustOutput;
    const result = output && 'path' in output && projection.builtin(output, 'Result') && output.args.length === 2;
    const success = projection.type(result ? output.args[0] : output, 'serialize', 'success');
    // The ABI also returns string failures for argument validation and panics.
    const error = result ? `(${projection.type(output.args[1], 'serialize', 'error')} | string)` : success === 'unknown' ? 'unknown' : 'string';
    diagnostics.push(...projection.diagnostics);
    return `  ${quoted(command.name)}: { input: ${input}; success: ${success}; error: ${error} };`;
  });
  return `// Generated by tauri-native from the registered Rust command model. Do not edit.
// Unknown projections and numeric limitations are listed in typeDiagnostics.
export interface Commands {
${contracts.join('\n')}
}
export const typeDiagnostics = ${JSON.stringify(diagnostics, null, 2)} as const;

type Response<T, E> = { ok: true; value: T } | { ok: false; error: E };
type Request<T, E> = Promise<Response<T, E>> & { cancel(): void };
type Options = { signal?: AbortSignal };
type Transport = (command: string, payload: Record<string, unknown>, options?: Options) => Request<unknown, unknown>;
type Input<K extends keyof Commands> = Commands[K] extends { input: infer I extends Record<string, unknown> } ? I : never;
type Success<K extends keyof Commands> = Commands[K] extends { success: infer T } ? T : never;
type Failure<K extends keyof Commands> = Commands[K] extends { error: infer E } ? E : never;

/** Connect the copied contract to either host SDK's invoke function. */
export function createCommands(invoke: Transport) {
  return function command<K extends keyof Commands>(name: K, payload: Input<K>, options?: Options): Request<Success<K>, Failure<K>> {
    return invoke(name, payload, options) as Request<Success<K>, Failure<K>>;
  };
}
`;
}
