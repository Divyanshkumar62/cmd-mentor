import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { EXIT_CODES } from './exit-codes.js';
import { detectEnvironment } from '../environment/detector.js';
import { KnowledgeBaseLoader } from '../knowledge-base/loader.js';
import { CommandEntry, Platform, SafetyLevel, ShellType } from '../types/command.js';
import { EnvironmentContext } from '../types/environment.js';
import { validateKnowledgeBase } from '../knowledge-base/validator.js';
import { runDoctor, formatDoctorReport } from '../knowledge-base/doctor.js';
import { loadCustomEntries } from '../knowledge-base/custom-loader.js';
import { scanProject } from '../knowledge-base/project-scanner.js';
import { SearchEngine, SearchResult } from '../search/engine.js';
import { FilterOptions } from '../search/filters.js';
import {
  formatPlainDetail,
  formatPlainSearchResults,
  formatPlainStats,
  formatPlainValidation,
  formatPlainHistory,
} from '../output/plain.js';
import { copyToClipboard } from '../clipboard/index.js';
import { buildZeroMatchGuidance, formatZeroMatchGuidance } from '../search/suggestions.js';
import { BookmarkStore } from '../storage/bookmarks.js';
import { ConfigStore } from '../storage/config.js';
import { HistoryStore } from '../storage/history.js';
import { executeCommand } from '../execution/runner.js';
import { generateExecutionPreview, ExecutionPreview } from '../execution/preview.js';
import { confirmExecution, UNATTENDED_HIGH_RISK_ENV } from '../execution/confirm.js';
import {
  buildPrompts,
  collectPlaceholderValues,
  parseSetPairs,
} from '../execution/placeholders.js';

export function resolveKnowledgeDirectory(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);

  const candidates = [
    path.resolve(currentDir, '../../knowledge/commands'),
    path.resolve(currentDir, '../knowledge/commands'),
    path.resolve(currentDir, 'knowledge/commands'),
    path.resolve(process.cwd(), 'knowledge/commands'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), 'knowledge/commands');
}

/** Resolve a command by exact ID, else by unique case-insensitive name. */
export function resolveEntry(
  loader: KnowledgeBaseLoader,
  identifier: string
): CommandEntry | undefined {
  const byId = loader.getById(identifier);
  if (byId) return byId;
  const target = identifier.toLowerCase();
  return loader.getAll().find((e) => e.name.toLowerCase() === target);
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.error(`Invalid numeric value: "${value}"`);
    process.exit(EXIT_CODES.USAGE_ERROR);
  }
  return parsed;
}

function formatExecutionPreview(preview: ExecutionPreview): string {
  const rule = '-'.repeat(80);
  const lines = [
    rule,
    'CmdMentor Command Execution Preview',
    rule,
    `Command:  ${preview.finalCommand}`,
    `CWD:      ${preview.cwd}`,
    `Target:   ${preview.platform} / ${preview.shell}`,
    `Risk:     ${preview.policy.level.toUpperCase()}`,
  ];
  if (preview.entry.risk.sideEffects) {
    lines.push(`Impact:   ${preview.entry.risk.sideEffects}`);
  }
  if (preview.entry.risk.reversibility) {
    lines.push(`Reverse:  ${preview.entry.risk.reversibility}`);
  }
  if (preview.policy.warningNotice) {
    lines.push(`Warning:  ${preview.policy.warningNotice}`);
  }
  lines.push(rule);
  return lines.join('\n');
}

/**
 * Builds a preview, converting a sanitizer rejection into a clean usage error
 * rather than an uncaught stack trace. Interpolation throws by design when a
 * supplied value contains shell metacharacters.
 */
function previewOrExit(
  entry: CommandEntry,
  options: Parameters<typeof generateExecutionPreview>[1]
): ExecutionPreview {
  try {
    return generateExecutionPreview(entry, options);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error('Placeholder values must not contain shell metacharacters.');
    process.exit(EXIT_CODES.USAGE_ERROR);
  }
}

interface ExecCommandOptions {
  yes?: boolean;
  template?: boolean;
  example?: number;
  set?: string[];
  timeout?: number;
  cwd?: string;
}

/** Commander reducer for a repeatable --set flag. */
function collectSetPair(value: string, previous: string[]): string[] {
  return [...previous, value];
}

interface SearchCommandOptions {
  plain?: boolean;
  json?: boolean;
  platform?: string;
  shell?: string;
  category?: string;
  risk?: string;
  limit?: number;
}

const VALID_PLATFORMS: Platform[] = ['windows', 'linux', 'macos'];
const VALID_SHELLS: ShellType[] = ['powershell', 'cmd', 'bash', 'zsh', 'fish', 'git-bash'];
const VALID_RISKS: SafetyLevel[] = ['informational', 'low', 'moderate', 'high', 'restricted'];

/** Validates a filter value against its allowed set, exiting with a usage error. */
function parseEnumOption<T extends string>(value: string | undefined, allowed: T[], label: string): T | undefined {
  if (value === undefined) return undefined;
  const normalized = value.toLowerCase() as T;
  if (!allowed.includes(normalized)) {
    console.error(`Invalid ${label}: "${value}". Expected one of: ${allowed.join(', ')}`);
    process.exit(EXIT_CODES.USAGE_ERROR);
  }
  return normalized;
}

function buildFilterOptions(
  options: SearchCommandOptions,
  environment: EnvironmentContext
): FilterOptions {
  return {
    platform: parseEnumOption(options.platform, VALID_PLATFORMS, 'platform'),
    shell: parseEnumOption(options.shell, VALID_SHELLS, 'shell'),
    category: options.category?.toLowerCase(),
    riskLevel: parseEnumOption(options.risk, VALID_RISKS, 'risk level'),
    preferredPlatform: environment.platform,
    preferredShell: environment.shell,
  };
}

function formatJsonResults(query: string, results: SearchResult[]): string {
  return JSON.stringify(
    {
      query,
      count: results.length,
      results: results.map((r) => ({
        id: r.entry.id,
        name: r.entry.name,
        title: r.entry.title,
        commandTemplate: r.entry.commandTemplate,
        platforms: r.entry.platforms,
        shells: r.entry.shells,
        risk: r.entry.risk,
        score: r.score,
        matchReasons: r.matchReasons,
      })),
    },
    null,
    2
  );
}

/**
 * Launches the Ink TUI. React, Ink, and the component tree are imported lazily
 * because they cost ~530ms to load - a price plain-text and CI runs must not
 * pay. Keeping the import here means `--plain` never touches the renderer.
 */
async function launchTui(props: {
  initialQuery: string;
  knowledgeBase: KnowledgeBaseLoader;
  environment: EnvironmentContext;
  mode: 'FULL' | 'FUZZY';
  bookmarkStore: BookmarkStore;
  configStore: ConfigStore;
  historyStore: HistoryStore;
}): Promise<never> {
  const [{ default: React }, { render }, { TerminalManager }, { App }] = await Promise.all([
    import('react'),
    import('ink'),
    import('../tui/terminal.js'),
    import('../tui/App.js'),
  ]);

  TerminalManager.setupSignalTraps();
  TerminalManager.enterAlternateScreen();

  const instance = render(React.createElement(App, props));
  await instance.waitUntilExit();
  TerminalManager.restoreTerminal();
  process.exit(EXIT_CODES.SUCCESS);
}

export function createCLI(): Command {
  const program = new Command();
  const environment = detectEnvironment();
  const kbLoader = new KnowledgeBaseLoader();

  // Load bundled commands
  const commandsDir = resolveKnowledgeDirectory();
  kbLoader.loadFromDirectory(commandsDir);

  // Load custom user snippets from ~/.cmdmentor/custom/
  const custom = loadCustomEntries();
  if (custom.entries.length > 0) {
    kbLoader.loadEntries(custom.entries);
  }

  // Storage stores
  const configStore = new ConfigStore();

  // Project-local commands (npm scripts, Make targets, Compose services).
  // Discovered from the working directory, never from the network.
  const projectScan = configStore.get().project.enabled
    ? scanProject(environment.cwd)
    : { entries: [], sources: [] };
  if (projectScan.entries.length > 0) {
    kbLoader.loadEntries(projectScan.entries);
  }

  const bookmarkStore = new BookmarkStore();
  const historyStore = new HistoryStore();

  program
    .name('cmdmentor')
    .description('Cross-platform offline-first command reference and learning assistant')
    .version('0.1.0', '-v, --version', 'Output the current version of CmdMentor')
    .argument('[query...]', 'Natural-language query, command name, or keyword')
    .option('-p, --plain', 'Force plain-text non-interactive output')
    .action(async (queryParts: string[], options: { plain?: boolean }) => {
      const query = queryParts.join(' ').trim();

      // Plain-text mode or non-TTY fallback
      if (options.plain || !environment.terminal.isTTY) {
        if (!query) {
          console.log(formatPlainSearchResults(kbLoader.getAll()));
          process.exit(EXIT_CODES.SUCCESS);
        }
        const engine = new SearchEngine(kbLoader.getAll());
        const results = engine.search(query, {
          preferredPlatform: environment.platform,
          preferredShell: environment.shell,
        });

        if (results.length === 0) {
          console.log(formatZeroMatchGuidance(buildZeroMatchGuidance(query, kbLoader.getAll())));
          process.exit(EXIT_CODES.NOT_FOUND);
        }

        console.log(formatPlainSearchResults(results.map((r) => r.entry)));
        process.exit(EXIT_CODES.SUCCESS);
      }

      // Interactive TUI Mode
      await launchTui({
        initialQuery: query,
        knowledgeBase: kbLoader,
        environment,
        mode: query ? 'FUZZY' : 'FULL',
        bookmarkStore,
        configStore,
        historyStore,
      });
    });

  // Subcommand: search
  program
    .command('search')
    .description('Search for commands in the offline knowledge base')
    .argument('<query...>', 'Query to search for')
    .option('-p, --plain', 'Output as plain text table')
    .option('--json', 'Output machine-readable JSON')
    .option('--platform <platform>', 'Filter by platform (windows|linux|macos)')
    .option('--shell <shell>', 'Filter by shell (powershell|cmd|bash|zsh|fish|git-bash)')
    .option('--category <category>', 'Filter by category (e.g. git, docker, filesystem)')
    .option('--risk <level>', 'Filter by risk (informational|low|moderate|high|restricted)')
    .option('-l, --limit <n>', 'Maximum number of results', parseIntOption)
    .action((queryParts: string[], options: SearchCommandOptions) => {
      const query = queryParts.join(' ').trim();
      const filters = buildFilterOptions(options, environment);
      const engine = new SearchEngine(kbLoader.getAll());
      let results = engine.search(query, filters);

      if (options.limit) {
        results = results.slice(0, options.limit);
      }

      const wantsPlain = options.plain || options.json || !environment.terminal.isTTY;

      if (wantsPlain) {
        if (results.length === 0) {
          if (options.json) {
            console.log(JSON.stringify({ query, results: [] }, null, 2));
          } else {
            console.log(
              formatZeroMatchGuidance(buildZeroMatchGuidance(query, kbLoader.getAll()))
            );
          }
          process.exit(EXIT_CODES.NOT_FOUND);
        }

        console.log(
          options.json
            ? formatJsonResults(query, results)
            : formatPlainSearchResults(results.map((r) => r.entry))
        );
        process.exit(EXIT_CODES.SUCCESS);
      }

      void launchTui({
        initialQuery: query,
        knowledgeBase: kbLoader,
        environment,
        mode: 'FUZZY',
        bookmarkStore,
        configStore,
        historyStore,
      });
    });

  // Subcommand: show
  program
    .command('show')
    .description('Show full details, syntax, and examples for a specific command')
    .argument('<identifier>', 'Command ID (e.g. filesystem.mkdir.posix) or exact name')
    .option('-p, --plain', 'Output as plain text', true)
    .option('--json', 'Output the full entry as JSON')
    .action((identifier: string, options: { json?: boolean }) => {
      const entry = resolveEntry(kbLoader, identifier);

      if (!entry) {
        console.error(`Command identifier not found: "${identifier}"`);
        const guidance = buildZeroMatchGuidance(identifier, kbLoader.getAll());
        if (guidance.relatedTerms.length > 0) {
          console.error(`Did you mean something like: ${guidance.relatedTerms.slice(0, 5).join(', ')}?`);
        }
        process.exit(EXIT_CODES.NOT_FOUND);
      }

      if (options.json) {
        console.log(JSON.stringify(entry, null, 2));
        process.exit(EXIT_CODES.SUCCESS);
      }

      console.log(formatPlainDetail(entry));

      // Surface related commands as runnable next steps rather than bare ids.
      const related = (entry.relatedCommands ?? [])
        .map((id) => kbLoader.getById(id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e));
      if (related.length > 0) {
        console.log('');
        console.log('See also:');
        for (const rel of related) {
          console.log(`  cmdmentor show ${rel.id.padEnd(32)} # ${rel.title}`);
        }
      }

      process.exit(EXIT_CODES.SUCCESS);
    });

  // Subcommand: copy
  program
    .command('copy')
    .description('Copy a command to the system clipboard')
    .argument('<identifier>', 'Command ID or exact name')
    .action(async (identifier: string) => {
      const entry = resolveEntry(kbLoader, identifier);

      if (!entry) {
        console.error(`Command identifier not found: "${identifier}"`);
        process.exit(EXIT_CODES.NOT_FOUND);
      }

      const cmd = entry.examples[0]?.command || entry.commandTemplate;
      const res = await copyToClipboard(cmd);

      if (res.success) {
        console.log(`Copied "${cmd}" to clipboard.`);
        process.exit(EXIT_CODES.SUCCESS);
      } else {
        console.error(res.error || 'Failed to copy to clipboard.');
        process.exit(EXIT_CODES.USAGE_ERROR);
      }
    });

  // Subcommand: exec
  program
    .command('exec')
    .description('Preview and execute a command after explicit safety confirmation')
    .argument('<identifier>', 'Command ID or exact name')
    .option('-y, --yes', 'Skip the interactive prompt for low-risk commands (never for high-risk)')
    .option('-t, --template', 'Run the command template (prompting for placeholders) instead of the first example')
    .option('-e, --example <n>', 'Run the Nth documented example (1-based)', parseIntOption)
    .option('-s, --set <name=value>', 'Supply a placeholder value; repeatable', collectSetPair, [])
    .option('--timeout <ms>', 'Abort the command if it runs longer than this', parseIntOption)
    .option('--cwd <path>', 'Working directory to run the command in')
    .action(async (identifier: string, options: ExecCommandOptions) => {
      const config = configStore.get();
      if (!config.execution.enabled) {
        console.error('Execution Error: Command execution is globally disabled in configuration.');
        process.exit(EXIT_CODES.USAGE_ERROR);
      }

      const entry = resolveEntry(kbLoader, identifier);
      if (!entry) {
        console.error(`Command identifier not found: "${identifier}"`);
        process.exit(EXIT_CODES.NOT_FOUND);
      }

      let preset: Record<string, string>;
      try {
        preset = parseSetPairs(options.set ?? []);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(EXIT_CODES.USAGE_ERROR);
      }

      // Choose the source command line: an explicit example, the template, or
      // the first reviewed example by default.
      let exampleIndex: number | undefined;
      if (options.example !== undefined) {
        if (options.example < 1 || options.example > entry.examples.length) {
          console.error(
            `Invalid example number ${options.example}. This entry has ${entry.examples.length} example(s).`
          );
          process.exit(EXIT_CODES.USAGE_ERROR);
        }
        exampleIndex = options.example - 1;
      }

      const useTemplate = Boolean(options.template) || Object.keys(preset).length > 0;

      // First pass: expand with whatever we already have, to discover what is
      // still missing.
      let preview = previewOrExit(entry, {
        cwd: options.cwd || environment.cwd,
        platform: environment.platform,
        shell: environment.shell,
        params: preset,
        selectedExampleIndex: exampleIndex,
        useTemplate,
      });

      // Policy gate first: never prompt for values on a command that can never run.
      if (!preview.policy.canExecute) {
        console.log(formatExecutionPreview(preview));
        console.error(`\nSafety Error: ${preview.policy.warningNotice || 'Execution blocked by policy.'}`);
        process.exit(EXIT_CODES.USAGE_ERROR);
      }

      if (preview.executability.reason === 'shell-evaluation') {
        console.log(formatExecutionPreview(preview));
        console.error(`\nCannot execute: ${preview.executability.detail}`);
        console.error(`Copy it instead:  cmdmentor copy ${entry.id}`);
        process.exit(EXIT_CODES.USAGE_ERROR);
      }

      // Placeholder gate: collect the missing values rather than refusing.
      if (preview.executability.reason === 'unfilled-placeholder') {
        const prompts = buildPrompts(preview.finalCommand, entry);
        console.log(`Command template: ${preview.finalCommand}`);
        console.log('Supply a value for each placeholder (blank accepts the example):');

        const collected = await collectPlaceholderValues({ prompts, preset });

        if (!collected.filled) {
          if (collected.reason === 'no-tty') {
            console.error(
              '\nAborted: this command has unfilled placeholders and there is no interactive terminal.'
            );
            console.error('Supply them non-interactively, e.g. --set name=value');
            process.exit(EXIT_CODES.TTY_REQUIRED);
          }
          console.error('\nExecution canceled - placeholders were not supplied.');
          process.exit(EXIT_CODES.CANCELED);
        }

        preview = previewOrExit(entry, {
          cwd: options.cwd || environment.cwd,
          platform: environment.platform,
          shell: environment.shell,
          params: { ...preset, ...collected.values },
          selectedExampleIndex: exampleIndex,
          useTemplate,
        });
        console.log('');
      }

      console.log(formatExecutionPreview(preview));

      // Re-check after interpolation: a supplied value must not have introduced
      // a shell operator, and nothing may remain unfilled.
      if (!preview.executability.executable) {
        console.error(`\nCannot execute: ${preview.executability.detail}`);
        process.exit(EXIT_CODES.USAGE_ERROR);
      }

      // Human gate (FR-009): nothing runs without an explicit decision.
      const outcome = await confirmExecution({
        policy: preview.policy,
        assumeYes: options.yes,
      });

      if (!outcome.confirmed) {
        if (outcome.reason === 'no-tty') {
          if (preview.policy.requiresStrictUppercaseConfirm) {
            console.error('\nAborted: high-risk commands require an interactive terminal to confirm.');
            console.error(
              `For CI that deliberately exercises destructive paths, set ${UNATTENDED_HIGH_RISK_ENV}=1 and pass --yes.`
            );
          } else {
            console.error('\nAborted: no interactive terminal. Re-run with --yes to confirm non-interactively.');
          }
          process.exit(EXIT_CODES.TTY_REQUIRED);
        }
        console.error('\nExecution canceled by user.');
        process.exit(EXIT_CODES.CANCELED);
      }

      if (outcome.unattended) {
        // Make the override impossible to miss in a CI log.
        console.error(
          `\n!! UNATTENDED HIGH-RISK EXECUTION (${UNATTENDED_HIGH_RISK_ENV}=1). No human confirmed this command.`
        );
      }

      historyStore.record(entry.name, config.history.enabled, 'EXECUTE');

      try {
        const res = await executeCommand({
          commandLine: preview.finalCommand,
          cwd: preview.cwd,
          executionEnabled: true,
          platform: environment.platform,
          shellType: environment.shell,
          timeoutMs: options.timeout,
          onStdout: (c) => process.stdout.write(c),
          onStderr: (c) => process.stderr.write(c),
        });

        console.log(`\nProcess finished with exit code ${res.exitCode} (${res.durationMs}ms)`);
        process.exit(res.exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.EXEC_FAILED);
      } catch (err: unknown) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(EXIT_CODES.EXEC_FAILED);
      }
    });

  // Subcommand group: bookmarks
  const bookmarksCommand = program.command('bookmarks').description('Manage saved bookmarks');

  bookmarksCommand
    .command('list')
    .description('List all bookmarked command IDs')
    .action(() => {
      const ids = bookmarkStore.list();
      if (ids.length === 0) {
        console.log('No bookmarks saved yet.');
        process.exit(EXIT_CODES.SUCCESS);
      }
      const bookmarkedEntries = ids
        .map((id) => kbLoader.getById(id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e));

      console.log(formatPlainSearchResults(bookmarkedEntries));
      process.exit(EXIT_CODES.SUCCESS);
    });

  bookmarksCommand
    .command('add')
    .argument('<identifier>', 'Command ID to bookmark')
    .description('Bookmark a command')
    .action((identifier: string) => {
      const entry = resolveEntry(kbLoader, identifier);

      if (!entry) {
        console.error(`Command identifier not found: "${identifier}"`);
        process.exit(EXIT_CODES.NOT_FOUND);
      }

      bookmarkStore.add(entry.id);
      console.log(`Bookmarked "${entry.name}" (${entry.id})`);
      process.exit(EXIT_CODES.SUCCESS);
    });

  bookmarksCommand
    .command('remove')
    .argument('<identifier>', 'Command ID to remove from bookmarks')
    .description('Remove a command from bookmarks')
    .action((identifier: string) => {
      bookmarkStore.remove(identifier);
      console.log(`Removed bookmark for "${identifier}"`);
      process.exit(EXIT_CODES.SUCCESS);
    });

  // Subcommand group: config
  const configCommand = program.command('config').description('View and update user configuration');

  configCommand
    .command('get')
    .argument('[key]', 'Config key (e.g. execution.enabled)')
    .description('Get config value(s)')
    .action((key?: string) => {
      const cfg = configStore.get();
      if (!key) {
        console.log(JSON.stringify(cfg, null, 2));
      } else if (key === 'execution.enabled') {
        console.log(String(cfg.execution.enabled));
      } else if (key === 'history.enabled') {
        console.log(String(cfg.history.enabled));
      } else {
        console.error(`Unknown config key: "${key}"`);
        process.exit(EXIT_CODES.USAGE_ERROR);
      }
      process.exit(EXIT_CODES.SUCCESS);
    });

  configCommand
    .command('set')
    .argument('<key>', 'Config key to set')
    .argument('<value>', 'Config value to set (true/false)')
    .description('Set a configuration key')
    .action((key: string, value: string) => {
      const boolVal = value.toLowerCase() === 'true' || value === '1';
      configStore.set(key, boolVal);
      console.log(`Updated config: ${key} = ${boolVal}`);
      process.exit(EXIT_CODES.SUCCESS);
    });

  // Subcommand group: history
  const historyCommand = program.command('history').description('View and manage local search/execution history');

  historyCommand
    .command('list')
    .description('List recent local history entries')
    .option('-l, --limit <n>', 'Maximum entries to show', parseIntOption)
    .action((options: { limit?: number }) => {
      const entries = historyStore.list().slice(0, options.limit ?? 25);
      if (entries.length === 0) {
        console.log('No history recorded yet.');
        process.exit(EXIT_CODES.SUCCESS);
      }
      console.log(formatPlainHistory(entries));
      process.exit(EXIT_CODES.SUCCESS);
    });

  historyCommand
    .command('clear')
    .description('Permanently delete all locally stored history')
    .action(() => {
      historyStore.clear();
      console.log('Local history cleared.');
      process.exit(EXIT_CODES.SUCCESS);
    });

  // Subcommand group: kb
  const kbCommand = program.command('kb').description('Knowledge base administration');

  kbCommand
    .command('version')
    .description('Display knowledge base version and statistics')
    .action(() => {
      console.log(formatPlainStats(kbLoader.getStats()));
      process.exit(EXIT_CODES.SUCCESS);
    });

  kbCommand
    .command('doctor')
    .description('Audit knowledge base content quality, risk classification, and references')
    .option('--verbose', 'List every warning instead of a summary')
    .option('--bundled-only', 'Skip project-discovered and custom entries')
    .action((options: { verbose?: boolean; bundledOnly?: boolean }) => {
      const all = kbLoader.getAll();
      const scope = options.bundledOnly
        ? all.filter((e) => !e.id.startsWith('project.') && !e.category.includes('custom'))
        : all;
      const report = runDoctor(scope);
      console.log(formatDoctorReport(report, options.verbose));
      process.exit(report.healthy ? EXIT_CODES.SUCCESS : EXIT_CODES.USAGE_ERROR);
    });

  kbCommand
    .command('validate')
    .description('Validate all knowledge base JSON entries against schema')
    .action(() => {
      const report = validateKnowledgeBase(kbLoader.getAll());
      console.log(formatPlainValidation(report));
      process.exit(report.valid ? EXIT_CODES.SUCCESS : EXIT_CODES.USAGE_ERROR);
    });

  return program;
}
