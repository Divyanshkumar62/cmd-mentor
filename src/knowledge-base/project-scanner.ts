import fs from 'node:fs';
import path from 'node:path';
import { CommandEntry } from '../types/command.js';

/**
 * Discovers commands that exist only in the current project - npm scripts,
 * Make targets, Compose services - and turns them into ordinary knowledge base
 * entries. This is PRD §8.2 Gap F: the commands a developer most often forgets
 * are the ones local to the repository they are standing in.
 *
 * Everything here is read-only and best-effort: a malformed manifest yields no
 * entries rather than an error, because a broken package.json must never stop
 * the user looking up `mkdir`.
 */

const MAX_SCRIPT_ENTRIES = 60;

export interface ProjectScanResult {
  entries: CommandEntry[];
  /** Directory the manifests were found in, if any. */
  projectRoot?: string;
  sources: string[];
}

/** Walks upward from `start` looking for a directory containing any marker. */
export function findProjectRoot(start: string, markers = ['package.json', 'Makefile', '.git']): string | undefined {
  let dir = path.resolve(start);
  // Bounded walk: stop at the filesystem root.
  for (let depth = 0; depth < 64; depth++) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(dir, marker))) {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function safeRead(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

/** Detects which package manager the project uses, from its lockfile. */
export function detectPackageManager(root: string): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function scriptRunCommand(manager: string, script: string): string {
  // `npm test`/`npm start` are the documented shorthands; everything else needs `run`.
  if (manager === 'npm' && (script === 'test' || script === 'start')) {
    return `npm ${script}`;
  }
  return `${manager} run ${script}`;
}

function toId(kind: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
  return `project.${kind}.${slug || 'unnamed'}`;
}

function baseEntry(fields: Partial<CommandEntry> & Pick<CommandEntry, 'id' | 'name' | 'title' | 'commandTemplate'>): CommandEntry {
  return {
    description: fields.description ?? fields.title,
    platforms: ['windows', 'linux', 'macos'],
    shells: ['bash', 'zsh', 'powershell', 'cmd', 'git-bash', 'fish'],
    category: ['project'],
    tags: [],
    aliases: [],
    flags: [],
    examples: [{ command: fields.commandTemplate, explanation: fields.title }],
    // Project scripts are unreviewed by definition: they are whatever this repo
    // happens to contain, so they are never claimed to be verified.
    risk: { level: 'moderate', destructive: false, requiresElevation: false },
    verification: { status: 'pending', lastReviewed: '1970-01-01', source: 'Discovered in project' },
    ...fields,
  } as CommandEntry;
}

function scanNpmScripts(root: string): CommandEntry[] {
  const raw = safeRead(path.join(root, 'package.json'));
  if (!raw) return [];

  let pkg: { name?: string; scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!pkg.scripts || typeof pkg.scripts !== 'object') return [];

  const manager = detectPackageManager(root);
  const entries: CommandEntry[] = [];

  for (const [script, body] of Object.entries(pkg.scripts)) {
    if (typeof body !== 'string') continue;
    const command = scriptRunCommand(manager, script);
    entries.push(
      baseEntry({
        id: toId('script', script),
        name: command,
        title: `Project script: ${script}`,
        description: `Runs the "${script}" script defined in this project's package.json:\n    ${body}`,
        commandTemplate: command,
        category: ['project', 'build'],
        tags: ['project', 'script', 'npm', script, manager],
        aliases: [`run ${script}`, `${script} script`, `project ${script}`],
        examples: [{ command, explanation: `Runs: ${body}` }],
      })
    );
    if (entries.length >= MAX_SCRIPT_ENTRIES) break;
  }

  return entries;
}

/**
 * Parses Makefile target names. Deliberately conservative: it matches only
 * lines that begin at column zero with a target followed by a colon, and skips
 * pattern rules, variable assignments, and .PHONY-style special targets.
 */
export function parseMakeTargets(makefile: string): string[] {
  const targets: string[] = [];
  for (const line of makefile.split(/\r?\n/)) {
    if (!line || /^\s/.test(line) || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*:(?!=)/.exec(line);
    if (!match) continue;
    const name = match[1]!;
    if (name.startsWith('.')) continue;
    if (!targets.includes(name)) targets.push(name);
  }
  return targets;
}

function scanMakeTargets(root: string): CommandEntry[] {
  const file = ['Makefile', 'makefile', 'GNUmakefile']
    .map((f) => path.join(root, f))
    .find((f) => fs.existsSync(f));
  if (!file) return [];

  const content = safeRead(file);
  if (!content) return [];

  return parseMakeTargets(content)
    .slice(0, MAX_SCRIPT_ENTRIES)
    .map((target) =>
      baseEntry({
        id: toId('make', target),
        name: `make ${target}`,
        title: `Make target: ${target}`,
        description: `Runs the "${target}" target defined in this project's Makefile.`,
        commandTemplate: `make ${target}`,
        category: ['project', 'build'],
        tags: ['project', 'make', 'makefile', 'target', target],
        aliases: [`make ${target}`, `run ${target} target`],
        examples: [{ command: `make ${target}`, explanation: `Runs the ${target} target.` }],
      })
    );
}

/**
 * Extracts Compose service names without a YAML parser: a service is a key
 * indented exactly one level under a top-level `services:` block.
 */
export function parseComposeServices(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const services: string[] = [];
  let inServices = false;
  let indent: number | undefined;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (/^services\s*:/.test(line)) {
      inServices = true;
      continue;
    }
    if (!inServices) continue;

    // A new top-level key ends the services block.
    if (/^\S/.test(line)) break;

    const leading = line.length - line.trimStart().length;
    if (indent === undefined) indent = leading;
    if (leading !== indent) continue;

    const match = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*:/.exec(line);
    if (match && !services.includes(match[1]!)) {
      services.push(match[1]!);
    }
  }

  return services;
}

function scanComposeServices(root: string): CommandEntry[] {
  const file = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml']
    .map((f) => path.join(root, f))
    .find((f) => fs.existsSync(f));
  if (!file) return [];

  const content = safeRead(file);
  if (!content) return [];

  return parseComposeServices(content)
    .slice(0, MAX_SCRIPT_ENTRIES)
    .map((service) =>
      baseEntry({
        id: toId('compose', service),
        name: `docker compose logs ${service}`,
        title: `Compose service: ${service}`,
        description: `Tails logs for the "${service}" service defined in this project's Compose file.`,
        commandTemplate: `docker compose logs -f ${service}`,
        category: ['project', 'docker'],
        tags: ['project', 'docker', 'compose', 'service', 'logs', service],
        aliases: [`logs for ${service}`, `${service} logs`],
        examples: [
          { command: `docker compose logs -f ${service}`, explanation: `Follows logs for ${service}.` },
        ],
        risk: { level: 'informational', destructive: false, requiresElevation: false },
      })
    );
}

/**
 * Scans a directory (walking up to the project root) for project-local
 * commands. Returns an empty result rather than throwing when nothing is found.
 */
export function scanProject(startDir: string = process.cwd()): ProjectScanResult {
  const root = findProjectRoot(startDir);
  if (!root) {
    return { entries: [], sources: [] };
  }

  const sources: string[] = [];
  const entries: CommandEntry[] = [];

  const npm = scanNpmScripts(root);
  if (npm.length) {
    sources.push('package.json');
    entries.push(...npm);
  }

  const make = scanMakeTargets(root);
  if (make.length) {
    sources.push('Makefile');
    entries.push(...make);
  }

  const compose = scanComposeServices(root);
  if (compose.length) {
    sources.push('compose');
    entries.push(...compose);
  }

  return { entries, projectRoot: root, sources };
}
