import { defineConfig } from "vitest/config";

// `ng test` owns src/ — those specs need the Angular TestBed and a jsdom
// environment. This project covers the rest of the repo: the check-gate
// guards in tools/ and the agent harness in .sandcastle/. Between the two
// runners every spec file in the tree is executed; tools/check-gate.test.ts
// asserts that.
export default defineConfig({
  test: {
    include: ["tools/**/*.test.ts", ".sandcastle/**/*.test.ts"],
    environment: "node",
  },
});
