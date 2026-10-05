# cmdmentor

> Cross-platform offline-first command reference and interactive terminal mentor.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/Node.js-20+-brightgreen.svg)]()
[![Build Tool](https://img.shields.io/badge/Bundler-tsup-blueviolet.svg)]()
[![Test Suite](https://img.shields.io/badge/Tested%20with-Vitest-yellow.svg)]()

---

## Overview

`cmdmentor` is an offline-first terminal assistant designed to eliminate destructive command accidents and accelerate CLI navigation. Rather than sending shell context to external third-party endpoints or searching through disjointed man pages, `cmdmentor` operates directly within your terminal with local knowledge bases, command validation rules, and safety boundaries.

### Core Capabilities
* **Offline Knowledge Engine:** Instant syntax explanations, parameter breakdowns, and safe examples without network latency.
* **Execution Safety Boundaries:** Proactively detects destructive patterns (such as unconstrained `rm -rf`, recursive deletions, or unflagged migrations) before execution.
* **Cross-Platform Support:** Consistent behavior across Linux, macOS, and Windows PowerShell/cmd environments.
* **Deterministic Test Coverage:** Comprehensive unit and integration test harnesses powered by Vitest (`tests/unit/loader.test.ts`, `tests/unit/kb-invariants.test.ts`).

---

## Architecture & Design

```
Terminal Input ──> CLI Dispatcher (src/bin) ──> Command Parser ──> Knowledge Loader (knowledge/)
                                                       │
                                                       ▼
                                            Safety Rule Engine
                                                       │
                                                       ▼
                                        Validated Output / Guidance
```

* **Module System:** ESM native (`"type": "module"`).
* **Compiler & Bundler:** Bundled with `tsup` for lightweight single-file distribution (`dist/bin/cmdmentor.js`).
* **Knowledge Store:** Structured markdown/JSON rule definitions located in `knowledge/`.

---

## Quickstart

### Prerequisites
* Node.js 20 or higher
* npm or pnpm

### Installation
```bash
# Clone the repository
git clone https://github.com/Divyanshkumar62/cmd-mentor.git
cd cmd-mentor

# Install dependencies
npm install

# Build distribution bundle
npm run build
```

### Running Locally
```bash
# Execute local binary
npm start

# Or run in development watch mode
npm run dev
```

### Running Test Harness
```bash
# Run all unit and integration tests
npm test

# Run knowledge base invariant verification
npm run test:kb
```

---

## License
Distributed under the [MIT License](LICENSE).
