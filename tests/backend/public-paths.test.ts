import { describe, expect, it } from "vitest";
import { PUBLIC_PATHS } from "../../src/backend/resolver.js";

// Core makes a route public only when a declared path has the same literal
// segments, so each public resolver route needs its own entry.
describe("public resolver paths", () => {
  it.each(["/u/:handle", "/u/:handle/:algo", "/u/:handle/ca"])(
    "declares %s",
    (path) => {
      expect(PUBLIC_PATHS).toContain(path);
    },
  );
});
