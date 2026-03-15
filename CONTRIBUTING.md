# Contributing to Argus

Thank you for your interest in contributing to Argus! This document provides guidelines and information for contributors.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build something great together.

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Docker (optional)
- Git

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/argus.git
   cd argus
   ```
3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/argus.git
   ```
4. Install dependencies:
   ```bash
   # Server
   cd server && npm install
   
   # Client
   cd ../client && npm install
   ```
5. Copy environment files:
   ```bash
   cp server/.env.example server/.env
   ```

## Development Workflow

### Branching Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates
- `refactor/*` - Code refactoring

### Creating a Branch

```bash
git checkout develop
git pull upstream develop
git checkout -b feature/your-feature-name
```

### Running Locally

```bash
# Terminal 1: Server
cd server
npm run dev

# Terminal 2: Client
cd client
npm run dev
```

### Running Tests

```bash
# Server tests
cd server && npm test

# Client tests
cd client && npm test
```

### Linting

```bash
# Server
cd server && npm run lint

# Client
cd client && npm run lint
```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/). Each commit message should be structured as:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style (formatting, semicolons) |
| `refactor` | Code refactoring |
| `perf` | Performance improvement |
| `test` | Adding/updating tests |
| `build` | Build system changes |
| `ci` | CI configuration changes |
| `chore` | Other changes |

### Examples

```bash
feat(api): add rate limiting to analyze endpoint
fix(client): resolve score display on mobile
docs: update installation instructions
refactor(server): extract validation middleware
```

## Pull Request Process

### Before Submitting

1. ✅ Ensure all tests pass
2. ✅ Run linting and fix issues
3. ✅ Update documentation if needed
4. ✅ Add tests for new features
5. ✅ Rebase on latest `develop`

### PR Checklist

- [ ] Descriptive title following commit conventions
- [ ] Linked related issues
- [ ] Added/updated tests
- [ ] Updated documentation
- [ ] Self-reviewed code
- [ ] No console.log or debug code

### Review Process

1. Submit PR against `develop` branch
2. Automated CI checks run
3. Maintainer reviews code
4. Address feedback
5. Squash and merge

### After Merge

```bash
git checkout develop
git pull upstream develop
git branch -d feature/your-feature-name
```

## Issue Guidelines

### Bug Reports

- Use the bug report template
- Include reproduction steps
- Provide error messages/logs
- Mention environment details

### Feature Requests

- Use the feature request template
- Explain the use case
- Describe proposed solution
- Consider alternatives

### Labels

| Label | Description |
|-------|-------------|
| `bug` | Something isn't working |
| `enhancement` | New feature request |
| `documentation` | Documentation improvement |
| `good first issue` | Good for newcomers |
| `help wanted` | Extra attention needed |
| `triage` | Needs initial review |

## Questions?

Feel free to open a discussion or reach out to maintainers. We're happy to help!

---

Thank you for contributing! 🎉
