# CmdMentor

> **Cross-platform, offline-first command reference and learning assistant with shell-aware discovery and confirmation-gated execution.**

CmdMentor helps developers, DevOps engineers, and learners discover, understand, copy, and safely execute terminal commands without searching the web or remembering arcane command flags.

---

## Key Features

- ⚡ **Offline-First & Fast:** 100% functional without internet connectivity. Sub-50ms search latency across curated command entries.
- 🐚 **Shell & OS Aware:** Automatically detects whether you are in Windows PowerShell, CMD, Git Bash, Linux Bash, or macOS Zsh, prioritizing compatible syntax and flagging differences.
- 🔍 **Natural-Language Discovery:** Search using everyday language (e.g. `create a folder`, `find process using port 8080`, `undo last commit`, `view last lines of log`).
- 🛡️ **Safety-Gated Execution:** Built-in 5-level risk classification (`informational`, `low`, `moderate`, `high`, `restricted`). High-risk commands require explicit uppercase `YES` confirmation.
- 🛑 **Global Kill Switch:** Command execution can be globally disabled at any time (`cmdmentor config set execution.enabled false`).
- 🔒 **Zero Telemetry & Credential Redaction:** History and bookmarks are stored strictly locally in standard OS directories. API keys, passwords, and tokens are automatically masked.
- 🖥️ **Full-Screen TUI & Plain-Text Fallback:** Interactive terminal UI built with Ink, plus `--plain` and `--json` modes for pipes and CI/CD.
- 📝 **Guided Placeholder Filling:** Run a command *template* and CmdMentor prompts for each `<placeholder>`, suggesting the value from its own example and rejecting anything containing shell metacharacters.
- 📁 **Project-Aware Discovery:** Finds this repository's own npm scripts, Make targets, and Compose services and makes them searchable alongside the bundled reference - clearly labelled as unreviewed.
- 🩺 **Content Health Auditing:** `cmdmentor kb doctor` checks risk classification against actual command behaviour, catches dangling references, and flags undeclared shell dependencies.

---

## Quick Start & Installation

### Running Locally from Source
```bash
# Clone or open the repository
cd command-reference

# Install dependencies and build
npm install
npm run build

# Launch full-screen interactive TUI
node dist/bin/cmdmentor.js

# Or link globally for 'cmdmentor' command
npm link
cmdmentor
```

---

## Launch Modes & Command Surface

### 1. Interactive Full-Screen TUI
```bash
cmdmentor
```
Opens the interactive terminal interface:
- Type keywords in the search bar.
- Use `↑` / `↓` arrow keys to navigate the results table.
- Press `Enter` to open the comprehensive command detail view (syntax, flags, examples, safety impact).
- Press `Enter` to open the detail view, then `X` for the execution preview.
- Press `Tab` to copy, or `Ctrl+B` to bookmark, straight from the results table.
- Press `Esc` to clear the query, and again to exit cleanly.

### 2. Fast Inline Fuzzy Search
```bash
cmdmentor <query>

# Examples:
cmdmentor create a folder
cmdmentor check port 8080
cmdmentor undo git commit
```
Displays an instant keyboard-driven table directly in your terminal. Press `Enter` or `C` to copy and exit immediately.

### 3. Plain-Text Non-Interactive Mode (Pipes & CI/CD)
```bash
# Search for commands in plain text table
cmdmentor search "docker run" --plain

# View full documentation for a command
cmdmentor show filesystem.mkdir.posix --plain

# Copy directly to clipboard
cmdmentor copy filesystem.mkdir.posix

# Filter by platform, shell, category, or risk level
cmdmentor search "list files" --plain --platform windows
cmdmentor search "delete" --plain --risk high --limit 5

# Machine-readable output for scripts and other tools
cmdmentor search "docker" --json

# Run a command with safety preview and confirmation prompt
cmdmentor exec filesystem.pwd.posix

# Non-interactive confirmation for scripts (low/moderate risk only)
cmdmentor exec git.status.all --yes
```

**Exit codes** (documented for CI use):

| Code | Meaning |
| :--- | :--- |
| `0` | Success |
| `1` | No results, or the requested command id does not exist |
| `2` | Usage error, invalid filter value, or execution blocked by policy |
| `3` | Confirmation required but no interactive terminal was available |
| `4` | User canceled the confirmation prompt |
| `5` | The executed command itself exited non-zero |

### 4. Filling Command Templates

Most entries document a template such as `mkdir <directory>`. Running the
template prompts for each placeholder:

```bash
$ cmdmentor exec filesystem.mkdir.posix --template
Command template: mkdir <directory>
Supply a value for each placeholder (blank accepts the example):
  <directory> (e.g. project): reports_2026

--------------------------------------------------------------------------------
Command:  mkdir reports_2026
...
Execute this command? [y/N]
```

Supply values non-interactively with repeatable `--set`, which is what scripts
and CI should use:

```bash
cmdmentor exec filesystem.mkdir.posix --set directory=build --yes
cmdmentor exec archive.tar.posix --set archive.tar.gz=backup.tar.gz --set directory=./src --yes
cmdmentor exec git.log.all --example 2 --yes    # run the 2nd documented example
```

Placeholder values are sanitized before substitution. Anything containing a
shell metacharacter (`;`, `&&`, `|`, backticks, `$`, `>`) is rejected outright
and, when prompting, you are asked again rather than dropped out of the flow.

### 5. Project-Local Commands

CmdMentor reads the working directory's `package.json`, `Makefile`, and Compose
file and turns their scripts, targets, and services into searchable entries:

```bash
$ cmdmentor search "typecheck" --plain
npm run typecheck | Project script: typecheck | ... | project
```

These are the commands people forget most often, because they exist only in the
current repository. They are always labelled `project` in the `SOURCE` column
and marked *not reviewed by CmdMentor*, because they are whatever the repo
happens to contain. The detail view shows the underlying script body.

Disable the scan with `cmdmentor config set project.enabled false`.

### 6. Bookmarks Management
```bash
cmdmentor bookmarks list
cmdmentor bookmarks add filesystem.mkdir.posix
cmdmentor bookmarks remove filesystem.mkdir.posix
```

### 7. Local History
```bash
cmdmentor history list            # Recent searches and executions
cmdmentor history list --limit 10
cmdmentor history clear           # Delete all locally stored history
```
History never leaves your machine, and secrets (API keys, passwords, bearer
tokens) are masked before anything is written. Disable it entirely with
`cmdmentor config set history.enabled false`.

### 8. Configuration & Kill-Switch
```bash
# View configuration
cmdmentor config get

# Disable command execution globally
cmdmentor config set execution.enabled false

# Re-enable command execution
cmdmentor config set execution.enabled true
```

### 9. Knowledge Base Administration
```bash
# View schema and content version statistics
cmdmentor kb version

# Verify integrity of all JSON knowledge base entries
cmdmentor kb validate

# Audit content quality: risk classification, references, shell marking
cmdmentor kb doctor
cmdmentor kb doctor --verbose        # list every warning
cmdmentor kb doctor --bundled-only   # ignore project and custom entries
```

`kb validate` proves entries are *well-formed*. `kb doctor` asks whether they are
*correct*: it flags a `rm -rf` example classified as low risk, a `relatedCommands`
id that resolves to nothing, an example whose pipes were never declared, and a
destructive command that never documents its reversibility. It exits non-zero on
errors, so it works as a CI gate for knowledge base contributions.

---

## Interactive TUI Keybindings

| Key | Context | Action |
| :--- | :--- | :--- |
| *(type)* | Search | Characters go straight to the search box - no mode switching |
| `↑` / `↓` | Search | Move through matching commands (`Ctrl+P` / `Ctrl+N` also work) |
| `PgUp` / `PgDn` | Search | Jump five rows at a time |
| `Enter` | Search | Open the detail view (flags, syntax, examples, audit trail) |
| `Tab` | Search | Copy the highlighted command to the clipboard |
| `Ctrl+B` | Search | Toggle bookmark `[★]` on the highlighted command |
| `Esc` | Search | Clear the query, or exit when it is already empty |
| `C` | Detail | Copy the command to the clipboard |
| `X` / `E` | Detail | Open the execution preview and confirmation modal |
| `S` | Detail | Toggle bookmark `[★]` |
| `B` / `Esc` / `Backspace` | Detail | Return to the results table |
| `Q` | Detail | Exit CmdMentor |
| *(type)* | Execution | Fill the highlighted `<placeholder>`; Enter accepts the example |
| `Y` / `N` | Execution | Confirm or cancel a low- or moderate-risk command |
| type `YES` | Execution | Required to confirm a **high-risk** command |
| `D` | Execution | Disable execution globally and return |
| `Ctrl+C` | Any | Exit immediately, restoring the terminal |

> In the search box, letters are always treated as text. Action keys such as `C`,
> `X`, and `S` apply in the detail view, so typing `docker` never triggers a copy.

---

## Execution Safety Model

CmdMentor never runs a command as a side effect of finding one. Every execution
passes three independent gates, and all of them must open.

**1. Policy gate — what the entry is.**
`restricted` entries are reference-only and can never execute. `high` entries
require a typed uppercase `YES`; a `--yes` flag will *not* satisfy them, because
an irreversible action should not be one flag away in a script.

**2. Structural gate — what the command needs.**
Commands are run with `spawn(..., { shell: false })` and a real argument array,
never by handing a string to `sh -c` or `powershell -Command`. A command that
genuinely needs a shell — pipes, redirection, `&&`, backticks, variable
expansion — is therefore refused rather than executed, because passing it as
argv would silently produce the *wrong* result:

```
$ cmdmentor exec process.ps.posix
Cannot execute: This command relies on shell features (pipes, redirection,
variables, or chaining) and cannot be executed safely by CmdMentor.
Copy it instead:  cmdmentor copy process.ps.posix
```

Those entries remain fully searchable, readable, and copyable — only execution
is withheld. Entries can also opt in explicitly with `"requiresShell": true`.

A command still containing an unfilled `<placeholder>` is never executed either.
Instead CmdMentor collects the missing values — interactively, or from `--set` —
sanitizes each one, and re-checks the expanded command before going any further.
A value that would introduce a shell operator is rejected, so filling a template
can never be used to smuggle one past the structural gate.

**3. Human gate — your explicit decision.**
On a terminal you are prompted. Without a terminal and without `--yes`,
execution is refused rather than assumed: silence is never consent.

| Situation | `informational` / `low` / `moderate` | `high` | `restricted` |
| :--- | :--- | :--- | :--- |
| Interactive terminal | prompt `[y/N]` | must type `YES` | blocked |
| `--yes` passed | runs | **still refused** | blocked |
| No terminal, no `--yes` | refused (exit 3) | refused (exit 3) | blocked |
| `--yes` + CI opt-in (below) | runs | runs, loudly logged | **still blocked** |

### CI opt-in for high-risk commands

By default a `high` risk command cannot run unattended at all — a single flag
should not be enough to destroy data with nobody watching. If your CI genuinely
needs to exercise destructive paths, arm the explicit opt-in:

```bash
CMDMENTOR_ALLOW_UNATTENDED_HIGH_RISK=1 cmdmentor exec filesystem.rm.posix --yes
```

Both signals are required, and the variable must be exactly `1`. The variable on
its own arms nothing, so a stray `export` in a shell profile cannot quietly turn
a developer's machine into one where `rm -rf` runs without confirmation. Every
unattended run prints a banner to stderr so it is visible in a CI log:

```
!! UNATTENDED HIGH-RISK EXECUTION (CMDMENTOR_ALLOW_UNATTENDED_HIGH_RISK=1). No human confirmed this command.
```

`restricted` commands remain unexecutable regardless of this setting.

The global kill switch (`cmdmentor config set execution.enabled false`) disables
all of it at once, and the TUI then hides the execute binding entirely.

---

## Safety Classification Matrix

| Level | Criteria | Policy & Safety Enforcement |
| :--- | :--- | :--- |
| **INFORMATIONAL** | Read-only inspection (`pwd`, `ls`, `git status`, `cat`, `lsof`). | Standard preview. Single confirmation to run. |
| **LOW** | Idempotent / readily reversible (`mkdir`, `touch`, `git checkout -b`). | Displays affected working directory. Standard confirmation. |
| **MODERATE** | Modifies state, overwrites files, kills processes (`mv`, `cp -f`, `kill`). | Warning badge. Explicit `[Y/N]` prompt. |
| **HIGH** | Destructive, recursive deletion, system changes (`rm -rf`, `git reset --hard`). | **Red Alert Banner.** Requires typing explicit uppercase `YES`. |
| **RESTRICTED** | Arbitrary remote script execution (`curl \| sh`, raw disk partition write). | **Execution Blocked.** Displayed for reference only; execution disallowed. |

---

## Adding Custom Commands

CmdMentor supports local organization and personal command snippets without external servers.

Create a JSON file in your personal directory:
- **Windows:** `%USERPROFILE%\.cmdmentor\custom\my-commands.json`
- **Linux / macOS:** `~/.cmdmentor/custom/my-commands.json`

Example snippet:
```json
[
  {
    "id": "custom.mytool.deploy",
    "name": "mytool deploy",
    "title": "Deploy service to staging cluster",
    "description": "Deploys the currently checked-out branch to the staging environment.",
    "commandTemplate": "mytool deploy --env staging",
    "platforms": ["windows", "linux", "macos"],
    "shells": ["powershell", "bash", "zsh"],
    "category": ["custom", "devops"],
    "tags": ["deploy", "staging", "k8s"],
    "aliases": ["deploy to staging", "push to staging"],
    "flags": [],
    "examples": [
      {
        "command": "mytool deploy --env staging",
        "explanation": "Runs staging deployment pipeline."
      }
    ],
    "risk": {
      "level": "moderate",
      "destructive": false,
      "requiresElevation": false
    },
    "verification": {
      "status": "reviewed",
      "lastReviewed": "2026-09-22",
      "source": "Internal Team Wiki"
    }
  }
]
```
CmdMentor automatically loads and validates your custom snippets at startup and surfaces them in search results with a `CUSTOM` badge.

---

## Development & Testing

```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run full test suite with v8 coverage
npm run test -- --coverage

# Validate knowledge base entries
npm run test:kb

# Rebuild distribution bundles
npm run build
```
