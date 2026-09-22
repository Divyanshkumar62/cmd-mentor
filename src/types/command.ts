export type Platform = 'windows' | 'linux' | 'macos';
export type ShellType = 'powershell' | 'cmd' | 'bash' | 'zsh' | 'fish' | 'git-bash';
export type SafetyLevel = 'informational' | 'low' | 'moderate' | 'high' | 'restricted';

export interface CommandExample {
  command: string;
  explanation: string;
  placeholders?: Record<string, string>;
}

export interface CommandFlag {
  name: string;
  shorthand?: string;
  description: string;
  required?: boolean;
}

export interface RiskMetadata {
  level: SafetyLevel;
  destructive: boolean;
  requiresElevation: boolean;
  sideEffects?: string;
  reversibility?: string;
}

export interface VerificationMetadata {
  status: 'reviewed' | 'pending' | 'deprecated';
  lastReviewed: string; // ISO Date YYYY-MM-DD
  source: string;
}

export interface CommandEntry {
  id: string;                               // Unique identifier: e.g. "filesystem.mkdir.linux"
  name: string;                             // Executable name: e.g. "mkdir"
  title: string;                            // Short title: "Create a directory"
  description: string;                      // Detailed explanation
  commandTemplate: string;                  // e.g. "mkdir <directory>"
  platforms: Platform[];                    // Supported OS platforms
  shells: ShellType[];                      // Compatible shells
  category: string[];                       // e.g. ["filesystem", "directory"]
  tags: string[];                           // Search tags & keywords
  aliases: string[];                        // Natural-language query equivalents
  flags: CommandFlag[];                     // Detailed flags documentation
  examples: CommandExample[];               // Verified practical examples
  risk: RiskMetadata;                       // Safety classification
  verification: VerificationMetadata;       // Audit trail metadata
  requiresShell?: boolean;                  // Needs shell evaluation; not executable by CmdMentor
  relatedCommands?: string[];               // IDs of related commands
  requires?: {
    tool?: string;                          // e.g. "git", "docker"
    versionMin?: string;
  };
  deprecation?: {
    replacedBy?: string;
    note?: string;
  };
}
