# Repository Guidelines

## Project Structure & Module Organization

This repository is currently empty apart from this guide. No application code, build configuration, tests, or assets have been established. When introducing the initial implementation, group related modules by feature and document the chosen layout in `README.md`.

Suggested directories, when applicable:

- `src/` for application or library source code.
- `tests/` for automated tests.
- `assets/` for static resources.
- `docs/` for architecture notes and contributor documentation.

Create directories only when they contain useful project files.

## Build, Test, and Development Commands

No build, test, or local development commands are configured yet. Do not assume commands such as `npm test` or `make build` are available. The first implementation should define reproducible setup, development, build, and test commands in `README.md`, alongside required runtime versions. Prefer project-local tooling and commit dependency lockfiles when supported.

## Coding Style & Naming Conventions

Use the standard conventions of the language selected for the project. Keep indentation consistent within each file, choose descriptive names, and avoid mixing naming styles within a module. Configure a formatter and linter when adding the toolchain; document their invocation. Keep changes focused and avoid unrelated formatting edits.

## Testing Guidelines

No testing framework or coverage threshold is configured. Add tests for new behavior and regression tests for bug fixes once executable code exists. Use descriptive test names that state the expected behavior, and follow the selected framework’s file naming conventions. Document how to run the complete suite and individual tests.

## Commit & Pull Request Guidelines

No Git history is available to establish existing commit conventions. Use concise, imperative commit subjects, such as `Add initial application scaffold`. Pull requests should describe the change, its purpose, and validation performed. Link relevant issues and include screenshots for visible interface changes. Explicitly identify checks that could not be run.

## Security & Configuration

Never commit credentials, tokens, or private configuration. When configuration is introduced, provide a sanitized example and ignore local secrets and generated artifacts.
