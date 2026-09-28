# 1. One check gate, on a supported toolchain

Date: 2026-09-28

## Status

Accepted.

## Context

`pnpm check` is the only interface this project offers for "is this change safe
to merge". Every agent workflow under `.sandcastle/` and the `Check` GitHub
Actions workflow treat a green run as evidence.

Until the Angular 22 upgrade it was not evidence. On the Node version CI pins,
Angular 6's webpack 4 build died on OpenSSL 3 (`ERR_OSSL_EVP_UNSUPPORTED`) and
Karma 1.7 aborted before executing a single spec — while exiting 0. `check`
ran lint, and lint alone. A broken build, a failing assertion and a type error
all passed through it silently, and `src/app/app.component.spec.ts` had in fact
been asserting the wrong title for years without anyone noticing.

Deleting the test stage entirely would have changed no observable behaviour.
That is the definition of ceremony.

## Decision

Verification runs on a currently supported toolchain, and `pnpm check` runs
every stage that can catch a defect.

- **Toolchain.** Angular 22 with `@angular/build`, Vitest under jsdom as the
  unit-test runner, and angular-eslint in place of the deprecated TSLint,
  preserving the `app` selector prefix the old `src/tslint.json` enforced. The
  Protractor e2e suite was deleted rather than ported: it is discontinued, and
  nothing invoked it. A replacement (Playwright, Cypress, WebdriverIO) is a
  decision for whoever adds the first e2e test.
- **Stages.** `check` is `typecheck && lint && build && test && test:tools`,
  in that order, chained with `&&` so the first failure stops the run.
- **Two test projects.** `pnpm run test` (`ng test`) owns `src/`, where specs
  need the Angular TestBed and a DOM. `pnpm run test:tools` (plain Vitest, see
  `vitest.config.mts`) owns `tools/` and the `.sandcastle/` agent harness,
  which run in Node. Between them every spec file in the repo is executed —
  before this split the harness's 46 tests ran nowhere.
- **Typecheck covers the whole tree.** `tsconfig.app.json`,
  `tsconfig.spec.json` and `tsconfig.tools.json` together include every
  TypeScript file in the repo.
- **The gate is itself tested.** `tools/check-gate.test.ts` asserts the stage
  list, that every tracked spec is discovered by a runner, that every tracked
  `.ts` file sits in a typecheck program, and — using
  `src/testing/failing-assertion.fixture.ts` — that the app runner really does
  exit non-zero when an assertion fails. A gate nobody has seen go red is not
  a gate.

## Consequences

- A green `pnpm check` now means the app builds, typechecks, lints, and every
  spec in the repo ran and passed. It takes roughly 25 seconds.
- Adding a spec in a directory no runner looks at, or source in a directory no
  tsconfig covers, fails the gate instead of quietly going unverified.
- `src/testing/failing-assertion.fixture.ts` fails on purpose. It is named
  `.fixture.ts` rather than `.spec.ts` so the normal run does not collect it;
  only the guard that invokes `ng test --include "**/*.fixture.ts"` does.
- The tooling typecheck relaxes `noPropertyAccessFromIndexSignature`, a house
  style rule rather than a soundness check, because the generated `.sandcastle`
  harness reads `process.env` with dot access.
- Staying current is now the cheap option and falling behind is the expensive
  one: the next Angular upgrade is a `ng update` away, against a suite that can
  actually fail.
