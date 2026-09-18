import { describe, expect, it } from "bun:test";

import pkg from "../package.json" with { type: "json" };

const dotExport = pkg.exports["."] as Record<string, unknown>;
const viteExport = pkg.exports["./vite"] as Record<string, unknown> | undefined;

describe("package exports surface", () => {
  it("serves the vitest runtime through the browser condition of the . export", () => {
    expect(dotExport).toBeDefined();
    expect(dotExport.browser).toEqual({
      types: "./dist/src/vitest/index.d.ts",
      default: "./dist/src/vitest/index.js",
    });
  });

  it("keeps the Playwright runtime as the default condition of the . export", () => {
    expect(dotExport.default).toEqual({
      types: "./dist/src/index.d.ts",
      default: "./dist/src/index.js",
    });
  });

  it("lists the browser condition before the default condition", () => {
    const keys = Object.keys(dotExport);

    expect(keys.indexOf("browser")).toBeLessThan(keys.indexOf("default"));
  });

  it("exposes the vite proxy plugin through the ./vite export", () => {
    expect(viteExport).toEqual({
      types: "./dist/src/vite/index.d.ts",
      default: "./dist/src/vite/index.js",
    });
  });
});

describe("peer dependencies", () => {
  it("declares optional vitest peers aligned with the browser runtime", () => {
    const meta = pkg.peerDependenciesMeta as Record<string, { optional: boolean } | undefined>;

    expect(pkg.peerDependencies.vitest).toBe(">=4 <5");
    expect(pkg.peerDependencies["@vitest/browser-playwright"]).toBe(">=4 <5");
    expect(meta.vitest).toEqual({ optional: true });
    expect(meta["@vitest/browser-playwright"]).toEqual({ optional: true });
  });

  it("keeps the Playwright peer required and unchanged", () => {
    const meta = pkg.peerDependenciesMeta as Record<string, { optional: boolean } | undefined>;

    expect(pkg.peerDependencies["@playwright/test"]).toBe(">=1.59.0");
    expect(meta["@playwright/test"]).toBeUndefined();
  });
});
