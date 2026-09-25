import { z } from 'zod';

export const PlatformSchema = z.enum(['windows', 'linux', 'macos']);
export const ShellTypeSchema = z.enum(['powershell', 'cmd', 'bash', 'zsh', 'fish', 'git-bash']);
export const SafetyLevelSchema = z.enum(['informational', 'low', 'moderate', 'high', 'restricted']);

export const CommandFlagSchema = z.object({
  name: z.string().min(1),
  shorthand: z.string().optional(),
  description: z.string().min(1),
  required: z.boolean().optional(),
});

export const CommandExampleSchema = z.object({
  command: z.string().min(1),
  explanation: z.string().min(3),
  placeholders: z.record(z.string()).optional(),
});

export const RiskMetadataSchema = z.object({
  level: SafetyLevelSchema,
  destructive: z.boolean(),
  requiresElevation: z.boolean(),
  sideEffects: z.string().optional(),
  reversibility: z.string().optional(),
});

export const VerificationMetadataSchema = z.object({
  status: z.enum(['reviewed', 'pending', 'deprecated']),
  lastReviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'lastReviewed must be in YYYY-MM-DD format'),
  source: z.string().min(1),
});

export const CommandEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-_]+(\.[a-z0-9-_]+)+$/, 'id must be dot-separated namespaced lowercase identifier (e.g. domain.name.platform)'),
  name: z.string().min(1),
  title: z.string().min(3).max(100),
  description: z.string().min(5),
  commandTemplate: z.string().min(1),
  platforms: z.array(PlatformSchema).min(1),
  shells: z.array(ShellTypeSchema).min(1),
  category: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string().min(1)).min(1),
  aliases: z.array(z.string()),
  flags: z.array(CommandFlagSchema),
  examples: z.array(CommandExampleSchema).min(1),
  risk: RiskMetadataSchema,
  verification: VerificationMetadataSchema,
  /** Declares the entry needs shell evaluation (pipes, redirection, cmdlets). */
  requiresShell: z.boolean().optional(),
  relatedCommands: z.array(z.string()).optional(),
  requires: z.object({
    tool: z.string().optional(),
    versionMin: z.string().optional(),
  }).optional(),
  deprecation: z.object({
    replacedBy: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  }).optional(),
});

export type CommandEntryInput = z.input<typeof CommandEntrySchema>;
export type CommandEntryOutput = z.output<typeof CommandEntrySchema>;
