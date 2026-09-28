import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for `pnpm check`, the one command that decides whether a change is
 * mergeable. The failure these tests exist to prevent is a gate that exits 0
 * without having verified anything: a stage dropped from the chain, a runner
 * that discovers no specs, source files that no tsconfig covers.
 *
 * A guard that cannot itself go red is the same bug one level up, so each
 * test below either compares against a list it did not hard-code, or asserts
 * its own input was non-empty before drawing a conclusion from it.
 */

const repoRoot = join(import.meta.dirname, "..");

/** Spawning a subprocess costs seconds, not milliseconds. */
const SUBPROCESS_TIMEOUT = 120_000;

/** Both runners and tsc colour their output even when stdout is a pipe. */
function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

/** Runs a command that must succeed, and returns its stdout. */
function run(command: string, args: string[]): string {
  return execFileSync(command, args, { cwd: repoRoot, encoding: "utf8" });
}

/** Runs a command that is expected to fail, and returns how it failed. */
function attempt(
  command: string,
  args: string[],
): { status: number | null; output: string } {
  const { status, stdout, stderr } = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return { status, output: stripAnsi(`${stdout}${stderr}`) };
}

function trackedFiles(...patterns: string[]): string[] {
  return [...new Set(run("git", ["ls-files", ...patterns]).split("\n"))]
    .filter(Boolean)
    .sort();
}

const scripts = (
  JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts;

describe("the check gate", () => {
  it("runs typecheck, lint, build and both test suites, in that order", () => {
    // Splitting on `&&` and then matching each stage exactly also pins the
    // separator: a `;` or a `||` would leave its stage unequal to the
    // expected string, and either one lets a failing stage pass its exit
    // code on to a later stage that succeeds.
    const stages = scripts["check"].split("&&").map((stage) => stage.trim());

    expect(stages).toEqual([
      "pnpm run typecheck",
      "pnpm run lint",
      "pnpm run build",
      "pnpm run test",
      "pnpm run test:tools",
    ]);
  });

  it("runs the app suite once instead of watching it", () => {
    // Watch mode never exits, so in CI it hangs until the job times out.
    expect(scripts["test"]).toContain("--watch=false");
  });
});

describe("spec discovery", () => {
  /** Test files the app runner (`pnpm run test`) reports, repo-relative. */
  function appSuiteFiles(): string[] {
    return specPathsIn(run("pnpm", ["exec", "ng", "test", "--list-tests"]));
  }

  /** Test files the tools runner (`pnpm run test:tools`) reports. */
  function toolsSuiteFiles(): string[] {
    return specPathsIn(run("pnpm", ["exec", "vitest", "list", "--filesOnly"]));
  }

  function specPathsIn(output: string): string[] {
    return stripAnsi(output)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[\w./-]+\.(?:spec|test)\.ts$/.test(line))
      .sort();
  }

  it(
    "executes every spec file tracked in the repo",
    () => {
      const app = appSuiteFiles();
      const tools = toolsSuiteFiles();

      // Two empty lists compare equal. Insist each runner found something
      // before trusting the comparison, so a runner that discovers nothing —
      // or an output format this test can no longer parse — fails here
      // rather than passing vacuously.
      expect(app.length).toBeGreaterThan(0);
      expect(tools.length).toBeGreaterThan(0);

      expect([...app, ...tools].sort()).toEqual(
        trackedFiles("*.spec.ts", "*.test.ts"),
      );
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe("the gate can go red", () => {
  const FAILING_SPEC = "src/testing/failing-assertion.fixture.ts";

  it(
    "fails when a spec assertion fails",
    () => {
      expect(existsSync(join(repoRoot, FAILING_SPEC))).toBe(true);

      const { status, output } = attempt("pnpm", [
        "exec",
        "ng",
        "test",
        "--watch=false",
        "--include",
        "**/*.fixture.ts",
      ]);

      expect(status).not.toBe(0);
      // An `--include` that matches no file also exits non-zero, so the exit
      // code alone would keep this test green after someone deleted the
      // fixture. Insist the fixture ran and that its assertion is what failed.
      expect(output).toContain(FAILING_SPEC);
      expect(output).toMatch(/Tests\s+1 failed/);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    "fails when a typechecked file has a type error",
    () => {
      // Unlike the failing assertion, this one cannot live in the tree: a
      // permanent type error would fail the gate it is meant to prove. Write
      // it into a directory `typecheck` covers, then take it straight back
      // out. `.gitignore` covers the probe in case this process is killed
      // before the `finally` runs.
      const probe = "tools/type-error.probe.ts";
      writeFileSync(
        join(repoRoot, probe),
        'export const wrong: number = "not a number";\n',
      );

      try {
        const { status, output } = attempt("pnpm", ["run", "typecheck"]);

        expect(status).not.toBe(0);
        expect(output).toContain(probe);
      } finally {
        rmSync(join(repoRoot, probe), { force: true });
      }
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe("typecheck coverage", () => {
  /**
   * The projects the `typecheck` stage actually compiles. Read out of the
   * script rather than listed here: a tsconfig this test knows about but
   * `typecheck` does not would cover files that nothing checks.
   */
  const TSCONFIGS = [...scripts["typecheck"].matchAll(/-p\s+(\S+)/g)].map(
    ([, tsconfig]) => tsconfig,
  );

  /** Tracked files that carry a .ts extension without being TypeScript. */
  const NOT_TYPESCRIPT = [".sandcastle/CODING_STANDARDS.ts"];

  function filesInProgram(tsconfig: string): string[] {
    return run("pnpm", ["exec", "tsc", "-p", tsconfig, "--listFilesOnly"])
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => isAbsolute(line))
      .map((file) => relative(repoRoot, file))
      .filter((file) => !file.startsWith("..") && !file.includes("node_modules"));
  }

  it(
    "typechecks every TypeScript file tracked in the repo",
    () => {
      const tracked = trackedFiles("*.ts", "*.mts");

      // An exemption that outlives the file it was cut for silently widens
      // into a hole over whatever takes that path next.
      expect(NOT_TYPESCRIPT.filter((file) => !tracked.includes(file))).toEqual(
        [],
      );

      const covered = new Set(TSCONFIGS.flatMap(filesInProgram));
      const unchecked = tracked
        .filter((file) => !NOT_TYPESCRIPT.includes(file))
        .filter((file) => !covered.has(file));

      expect(unchecked).toEqual([]);
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe("the docs that describe the gate", () => {
  // The ADR is deliberately absent: it records history, so it cites files
  // this change deleted (`src/tslint.json`) and should keep citing them.
  const DOCS = [".github/workflows/test.yml", "README.md"];

  /**
   * Repo-relative paths, anchored to a top-level directory so that URLs and
   * package names are not mistaken for files in this tree.
   */
  const REPO_PATH =
    /(?<![\w./-])(?:\.github|\.sandcastle|docs|public|src|tools)(?:\/[\w.-]+)+\.\w+/g;

  const workflow = readFileSync(
    join(repoRoot, ".github/workflows/test.yml"),
    "utf8",
  );

  it("runs the same gate a developer runs by hand", () => {
    expect(workflow).toContain("pnpm run check");
  });

  it("points only at files that exist", () => {
    // The comment in the workflow once described a pipeline of oxlint,
    // package boundaries and file guards that this repository has never run.
    const referenced = [
      ...new Set(
        DOCS.flatMap(
          (doc) => readFileSync(join(repoRoot, doc), "utf8").match(REPO_PATH) ?? [],
        ),
      ),
    ];

    // A regex that quietly stops matching turns the assertion below into one
    // that cannot fail, which is the exact defect these guards exist for.
    expect(referenced.length).toBeGreaterThan(0);
    expect(
      referenced.filter((path) => !existsSync(join(repoRoot, path))),
    ).toEqual([]);
  });
});
