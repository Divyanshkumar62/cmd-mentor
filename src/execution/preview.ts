import { CommandEntry, Platform, ShellType } from '../types/command.js';
import { ExecutionPolicy } from '../types/safety.js';
import { getExecutionPolicy } from '../safety/policy.js';
import { interpolateTemplate } from '../safety/sanitizer.js';
import { assessExecutability, ExecutabilityResult } from '../safety/shell-requirement.js';

export interface ExecutionPreview {
  entry: CommandEntry;
  finalCommand: string;
  cwd: string;
  platform: Platform;
  shell: ShellType;
  policy: ExecutionPolicy;
  /** Whether the expanded command line can be run via structured spawn. */
  executability: ExecutabilityResult;
}

export function generateExecutionPreview(
  entry: CommandEntry,
  options: {
    cwd?: string;
    params?: Record<string, string>;
    platform?: Platform;
    shell?: ShellType;
    selectedExampleIndex?: number;
    /** Start from commandTemplate rather than a reviewed example. */
    useTemplate?: boolean;
  } = {}
): ExecutionPreview {
  const cwd = options.cwd || process.cwd();
  const platform = options.platform || 'windows';
  const shell = options.shell || 'powershell';

  // Source selection, in priority order: an explicitly chosen example, an
  // explicit request for the template, otherwise the first reviewed example.
  let rawCommand: string;
  if (options.selectedExampleIndex !== undefined && entry.examples[options.selectedExampleIndex]) {
    rawCommand = entry.examples[options.selectedExampleIndex]!.command;
  } else if (options.useTemplate || entry.examples.length === 0) {
    rawCommand = entry.commandTemplate;
  } else {
    rawCommand = entry.examples[0]!.command;
  }

  const finalCommand = options.params
    ? interpolateTemplate(rawCommand, options.params)
    : rawCommand;

  const policy = getExecutionPolicy(entry);
  // An explicit `requiresShell: true` marking always wins over auto-detection.
  const executability = entry.requiresShell
    ? {
        executable: false,
        reason: 'shell-evaluation' as const,
        detail:
          'This entry is marked as requiring shell evaluation and cannot be executed safely by CmdMentor. Copy it and run it in your shell instead.',
      }
    : assessExecutability(finalCommand);

  return {
    entry,
    finalCommand,
    cwd,
    platform,
    shell,
    policy,
    executability,
  };
}
