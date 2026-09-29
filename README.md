# ToDoler

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 22.2.0.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Builds are production-configured by default; use `--configuration development` for an unoptimised build.

## Checks

Run `pnpm check` before pushing. It is the gate CI runs, and it runs five
stages in order, stopping at the first failure:

| Stage | Command | Covers |
| --- | --- | --- |
| typecheck | `pnpm run typecheck` | the app, its specs, and `tools/` + `.sandcastle/` |
| lint | `pnpm run lint` | `src/**/*.ts` and `src/**/*.html`, with angular-eslint |
| build | `pnpm run build` | the production bundle |
| test | `pnpm run test` | the app specs, under jsdom |
| test:tools | `pnpm run test:tools` | the Node specs in `tools/` and `.sandcastle/` |

`tools/check-gate.test.ts` guards the gate itself — see
[ADR 1](docs/adr/0001-one-check-gate-on-a-supported-toolchain.md).

## Running unit tests

Run `ng test` to execute the app's unit tests via [Vitest](https://vitest.dev) in a jsdom environment, or `pnpm run test:watch` to keep them running. The specs that run in plain Node — the check-gate guards and the `.sandcastle` agent harness — belong to the second Vitest project: `pnpm run test:tools`.

## Linting

Run `ng lint` to lint the project with [angular-eslint](https://github.com/angular-eslint/angular-eslint).

## End-to-end tests

This project has no end-to-end tests. The original Protractor suite was dropped during the Angular 22 upgrade — Protractor reached end of life and is not supported by the current CLI. Pick a replacement (Playwright, Cypress or WebdriverIO) before adding e2e coverage back.

## Further help
To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/main/README.md).
