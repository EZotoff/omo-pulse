# Contributing to omo-pulse

Thank you for your interest in contributing to omo-pulse! Every contribution matters, whether it's a bug report, a feature idea, or a pull request. This guide will help you get started.

Please review our [Code of Conduct](CODE_OF_CONDUCT.md) before participating. We are committed to providing a welcoming and inclusive environment for everyone.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) >= 1.1.0

### Getting Started

```bash
# Clone the repository
git clone https://github.com/ezotoff/omo-pulse.git
cd omo-pulse

# Install dependencies
bun install

# Start the development servers
bun run dev
```

This starts both the Vite UI dev server and the Hono API server.

### Available Scripts

| Script          | Description                  |
| --------------- | ---------------------------- |
| `bun run dev`   | Start all dev servers        |
| `bun run build` | Production build             |
| `bun run test`  | Run tests (Vitest)           |
| `bun run start` | Start production server      |

## How to Contribute

### Report a Bug

Open a [GitHub Issue](https://github.com/ezotoff/omo-pulse/issues) with:

- A clear, descriptive title
- Steps to reproduce the problem
- What you expected vs. what happened
- Browser/OS/Bun version if relevant

### Suggest a Feature

Open a [GitHub Issue](https://github.com/ezotoff/omo-pulse/issues) describing:

- The problem your feature would solve
- Your proposed solution
- Any alternatives you've considered

### Submit Code

We use a standard fork-and-PR workflow:

1. **Fork** the repository on GitHub
2. **Clone** your fork locally
   ```bash
   git clone https://github.com/your-username/omo-pulse.git
   ```
3. **Create a branch** from `main`
   ```bash
   git checkout -b feat/your-feature
   ```
4. **Make your changes**
5. **Run the tests**
   ```bash
   bun run test
   ```
6. **Commit** using [Conventional Commits](#commit-conventions)
   ```bash
   git commit -m "feat: add sparkline tooltip"
   ```
7. **Push** to your fork
   ```bash
   git push origin feat/your-feature
   ```
8. **Open a Pull Request** against `main`

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/). Each commit message should be structured as:

```
<type>: <short description>
```

Common types:

| Type       | When to use                              |
| ---------- | ---------------------------------------- |
| `feat`     | A new feature                            |
| `fix`      | A bug fix                                |
| `docs`     | Documentation changes                    |
| `chore`    | Build, tooling, or maintenance changes   |
| `refactor` | Code changes that don't fix or add       |
| `test`     | Adding or updating tests                 |

Keep the description concise and lowercase. Use the commit body for additional context when needed.

## Code Style

- **TypeScript** with strict mode enabled
- **React** functional components (no class components)
- **Hono** for server-side routes and middleware
- **CSS** files co-located with their components

Keep code simple and readable. Match the conventions you see in the existing codebase.

## Testing

Run the full test suite before submitting a pull request:

```bash
bun run test
```

If your change adds new functionality, include tests. Tests live in `src/__tests__/`.

## Developer Certificate of Origin (DCO)

We recommend (but do not require) that you sign off your commits to certify you wrote or have the right to submit the code under the project's MIT license. You can do this by adding a `Signed-off-by` line:

```bash
git commit -s -m "feat: add new component"
```

This adds a line like:

```
Signed-off-by: Your Name <your.email@example.com>
```

See [developercertificate.org](https://developercertificate.org/) for the full DCO text. There is no CI enforcement for this.

## Getting Help

- **GitHub Issues** -- for bugs and feature requests: [github.com/ezotoff/omo-pulse/issues](https://github.com/ezotoff/omo-pulse/issues)
- **GitHub Discussions** -- for questions and general conversation: [github.com/ezotoff/omo-pulse/discussions](https://github.com/ezotoff/omo-pulse/discussions)

We appreciate your time and effort. Thank you for helping make omo-pulse better!
