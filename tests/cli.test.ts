import { describe, expect, it } from "vitest";

import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("requires --config for the generate command", () => {
    expect(() => parseCliArgs(["generate"])).toThrow("Missing required --config option");
  });

  it("parses generate options including dry-run", () => {
    expect(parseCliArgs(["generate", "--config", "./strybk.config.ts", "--dry-run"])).toEqual({
      command: "generate",
      configPath: "./strybk.config.ts",
      dryRun: true,
    });
  });
});
