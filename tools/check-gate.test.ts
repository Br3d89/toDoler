import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

/**
 * A spec that fails on purpose, so that a guard can watch the gate go red.
 * Named `.fixture.ts` rather than `.spec.ts` so the normal run does not
 * collect it — an exclusion the "spec discovery" block asserts rather than
 * assumes.
 */
const FAILING_ASSERTION_FIXTURE = "src/testing/failing-assertion.fixture.ts";

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
  /** Everything the app runner (`pnpm run test`) says it would execute. */
  function appSuiteListing(): string {
    return stripAnsi(run("pnpm", ["exec", "ng", "test", "--list-tests"]));
  }

  /** Test files the app runner (`pnpm run test`) reports, repo-relative. */
  function appSuiteFiles(): string[] {
    return specPathsIn(appSuiteListing());
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

  it(
    "leaves the deliberately failing fixture out of the normal run",
    () => {
      // The fixture stays out of `pnpm run test` only because the builder's
      // default `include` covers *.spec.ts and *.test.ts and nothing else.
      // No file in this repo says so, so widening `include` — or adding a
      // coverage run over src/ — would turn the gate red on a spec that is
      // supposed to fail. Assert the exclusion rather than inherit it.
      const listing = appSuiteListing();

      // `not.toContain` passes against an empty or unparseable listing, for
      // the wrong reason. Confirm the listing enumerated specs at all first.
      expect(specPathsIn(listing).length).toBeGreaterThan(0);
      expect(listing).not.toContain(FAILING_ASSERTION_FIXTURE);
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe("the gate can go red", () => {
  /** Removes probes a previous run was killed before cleaning up. */
  function sweepProbes(): void {
    for (const entry of readdirSync(join(repoRoot, "tools"))) {
      if (entry.endsWith(".probe.ts")) {
        rmSync(join(repoRoot, "tools", entry), { force: true });
      }
    }
  }

  it(
    "fails when a spec assertion fails",
    () => {
      expect(existsSync(join(repoRoot, FAILING_ASSERTION_FIXTURE))).toBe(true);

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
      expect(output).toContain(FAILING_ASSERTION_FIXTURE);
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
      // out.
      //
      // A run killed before its `finally` leaves a probe behind, and
      // `tsconfig.tools.json` keeps compiling it, so every later `typecheck`
      // fails on a file nobody wrote. Sweeping first makes that self-heal,
      // and the probes are deliberately *not* gitignored: one that outlives
      // the sweep should show up in `git status` next to the type error it
      // causes, rather than being hidden from the one command that would
      // explain it. The pid keeps concurrent runs off each other's probe.
      sweepProbes();
      const probe = `tools/type-error.${process.pid}.probe.ts`;
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
      .filter(
        (file) => !file.startsWith("..") && !file.includes("node_modules"),
      );
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
  const WORKFLOW = ".github/workflows/test.yml";
  const ADR = "docs/adr/0001-one-check-gate-on-a-supported-toolchain.md";

  /**
   * Docs that cite files in this tree, each asserted below to still yield at
   * least one path *on its own*. A total across every doc is not enough: it
   * stays above zero on one doc's citations while another silently drops out
   * of the scan, which is how the first version of this guard went inert.
   */
  const DOCS_CITING_FILES = ["README.md", ADR];

  /**
   * Scanned for paths that do not exist, but not required to cite any. The
   * workflow comment describes the pipeline in prose, and demanding it name a
   * file would be rewriting the doc to suit the test.
   */
  const DOCS_SCANNED_ONLY = [WORKFLOW];

  /**
   * Paths the ADR cites *because* they are gone — it records the decision
   * that deleted them. Exempt from the existence check, and guarded below so
   * the exemption cannot outlive the sentence it was cut for.
   */
  const DELETED_BY_THIS_DECISION = ["src/tslint.json"];

  /**
   * Repo-relative paths, anchored to a top-level directory so that URLs and
   * package names are not mistaken for files in this tree.
   */
  const REPO_PATH =
    /(?<![\w./-])(?:\.github|\.sandcastle|docs|public|src|tools)(?:\/[\w.-]+)+\.\w+/g;

  function pathsCitedIn(doc: string): string[] {
    const text = readFileSync(join(repoRoot, doc), "utf8");

    return [...new Set(text.match(REPO_PATH) ?? [])];
  }

  it("runs the same gate a developer runs by hand", () => {
    expect(readFileSync(join(repoRoot, WORKFLOW), "utf8")).toContain(
      "pnpm run check",
    );
  });

  it("points only at files that exist", () => {
    // The workflow comment once described a pipeline of oxlint, package
    // boundaries and file guards that this repository has never run, citing
    // a `docs/agents/testing.md` that never existed.
    const citations = new Map(
      [...DOCS_CITING_FILES, ...DOCS_SCANNED_ONLY].map((doc) => [
        doc,
        pathsCitedIn(doc),
      ]),
    );

    // A regex that quietly stops matching turns the assertion below into one
    // that cannot fail, which is the exact defect these guards exist for.
    for (const doc of DOCS_CITING_FILES) {
      expect(citations.get(doc), `${doc} cites no files`).not.toEqual([]);
    }

    // Reported as `doc -> path` so a failure names the doc to go and edit.
    const missing = [...citations].flatMap(([doc, paths]) =>
      paths
        .filter((path) => !DELETED_BY_THIS_DECISION.includes(path))
        .filter((path) => !existsSync(join(repoRoot, path)))
        .map((path) => `${doc} -> ${path}`),
    );

    expect(missing).toEqual([]);
  });

  it("exempts a deleted path only while a doc still cites it", () => {
    const cited = DOCS_CITING_FILES.flatMap(pathsCitedIn);

    expect(
      DELETED_BY_THIS_DECISION.filter((path) => !cited.includes(path)),
    ).toEqual([]);

    // Were one of these to come back, it would stop being an exemption and
    // start being a path the guard above should check like any other.
    expect(
      DELETED_BY_THIS_DECISION.filter((path) =>
        existsSync(join(repoRoot, path)),
      ),
    ).toEqual([]);
  });
});
