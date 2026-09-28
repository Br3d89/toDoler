import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for `pnpm check`, the one command that decides whether a change is
 * mergeable. The failure these tests exist to prevent is a gate that exits 0
 * without having verified anything: a stage dropped from the chain, a runner
 * that discovers no specs, source files that no tsconfig covers.
 */

const repoRoot = join(import.meta.dirname, "..");

/** Spawning a subprocess costs seconds, not milliseconds. */
const SUBPROCESS_TIMEOUT = 120_000;

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { cwd: repoRoot, encoding: "utf8" });
}

function exitCodeOf(command: string, args: string[]): number | null {
  return spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" }).status;
}

function trackedFiles(...patterns: string[]): string[] {
  return [...new Set(run("git", ["ls-files", ...patterns]).split("\n"))]
    .filter(Boolean)
    .sort();
}

const packageJson = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

const checkScript = packageJson.scripts["check"];

describe("the check gate", () => {
  it("runs typecheck, lint, build and both test suites", () => {
    const stages = checkScript.split("&&").map((stage) => stage.trim());

    expect(stages).toEqual([
      "pnpm run typecheck",
      "pnpm run lint",
      "pnpm run build",
      "pnpm run test",
      "pnpm run test:tools",
    ]);
  });

  it("stops at the first stage that fails", () => {
    // `&&` is the only separator allowed: a `;` or a `||` would let a failing
    // stage pass its exit code on to a later one that succeeds.
    expect(checkScript).not.toMatch(/[;|]/);
  });

  it("runs the app suite once instead of watching it", () => {
    // Watch mode never exits, so in CI it hangs until the job times out.
    expect(packageJson.scripts["test"]).toContain("--watch=false");
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
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[\w./-]+\.(?:spec|test)\.ts$/.test(line))
      .sort();
  }

  it(
    "executes every spec file tracked in the repo",
    () => {
      const executed = [...appSuiteFiles(), ...toolsSuiteFiles()].sort();

      expect(executed).toEqual(trackedFiles("*.spec.ts", "*.test.ts"));
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    "reports a non-zero spec count for both suites",
    () => {
      expect(appSuiteFiles().length).toBeGreaterThan(0);
      expect(toolsSuiteFiles().length).toBeGreaterThan(0);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    "fails when a spec assertion fails",
    () => {
      // The gate is only evidence if it can produce a red. Run the app runner
      // over a fixture that asserts something false and watch it exit non-zero.
      const exitCode = exitCodeOf("pnpm", [
        "exec",
        "ng",
        "test",
        "--watch=false",
        "--include",
        "**/*.fixture.ts",
      ]);

      expect(exitCode).not.toBe(0);
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe("typecheck coverage", () => {
  const TSCONFIGS = [
    "tsconfig.app.json",
    "tsconfig.spec.json",
    "tsconfig.tools.json",
  ];

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
      const covered = new Set(TSCONFIGS.flatMap(filesInProgram));
      const tracked = trackedFiles("*.ts").filter(
        (file) => !NOT_TYPESCRIPT.includes(file),
      );

      expect(tracked.filter((file) => !covered.has(file))).toEqual([]);
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe("the Check workflow", () => {
  const workflow = readFileSync(
    join(repoRoot, ".github/workflows/test.yml"),
    "utf8",
  );

  it("runs the same gate a developer runs by hand", () => {
    expect(workflow).toContain("pnpm run check");
  });

  it("describes only files that exist", () => {
    // The comment in this workflow once described a pipeline of oxlint, package
    // boundaries and file guards that this repository has never run.
    const referenced = workflow.match(/[\w.-]+(?:\/[\w.-]+)+\.\w+/g) ?? [];
    const missing = [...new Set(referenced)].filter(
      (path) => !existsSync(join(repoRoot, path)),
    );

    expect(missing).toEqual([]);
  });
});
