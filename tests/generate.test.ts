import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { defineConfig, type StrybkConfig } from "../src/config.js";
import { generateScreenshots } from "../src/generate/index.js";
import { renderScreenshotSpec } from "../src/generate/render.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

const snapshotNameSanitizer = new RegExp(
  String.raw`[\x00-\x2C\x2E-\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]+`,
  "gu",
);

const sanitizeForSnapshotName = (titlePath: string[]): string =>
  titlePath.join(" ").replace(snapshotNameSanitizer, "-");

describe("snapshot name invariants", () => {
  it("keeps anonymous snapshot names identical between flat and nested describes", () => {
    const flat = sanitizeForSnapshotName(["Components/Комментарии/CommentLine", "Comment line"]);
    const nested = sanitizeForSnapshotName([
      "Components",
      "Комментарии",
      "CommentLine",
      "Comment line",
    ]);

    expect(nested).toBe(flat);
    expect(nested).toBe("Components-Комментарии-CommentLine-Comment-line");
  });
});

describe("renderScreenshotSpec", () => {
  it("renders generated tests and preserves the manual region", () => {
    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: ["components/**/__stories__/*.stories.tsx"],
      resolveSpecPath: ({ storyFilePath }) =>
        storyFilePath
          .replace("/__stories__/", "/__screenshots__/")
          .replace(".stories.tsx", ".screenshots.spec.ts"),
    });

    const content = renderScreenshotSpec({
      config,
      title: "Button",
      stories: [
        { id: "button--default", name: "Default" },
        { id: "button--warning", name: "Warning" },
      ],
      manualRegion:
        "test('hover', async ({ sharedPage }) => { await expect(sharedPage).toHaveScreenshot(); });",
    });

    expect(content).toContain("import { test, expect, switchStory } from '@crvy/strybk'");
    expect(content).toContain("test.describe('Button'");
    expect(content).toContain("async ({ sharedPage, creevey })");
    expect(content).toContain("creevey.params('button--default')");
    expect(content).toContain("test.skip(skip, reason)");
    expect(content).toContain("await switchStory(sharedPage, 'button--default')");
    expect(content).toContain(
      "const target = captureElement ? sharedPage.locator(captureElement) : sharedPage",
    );
    expect(content).toContain(
      "mask: ignoreElements.map((selector) => sharedPage.locator(selector))",
    );
    expect(content).toContain("// @generated-end auto-screenshots");
    expect(content).toContain("test('hover'");
  });

  it("falls back to auto-screenshots markers when generatedRegionName is absent", () => {
    const config: StrybkConfig = {
      storybookUrl: "http://localhost:6060",
      storyGlobs: ["components/**/__stories__/*.stories.tsx"],
      resolveSpecPath: ({ storyFilePath }) =>
        storyFilePath
          .replace("/__stories__/", "/__screenshots__/")
          .replace(".stories.tsx", ".screenshots.spec.ts"),
    };

    const content = renderScreenshotSpec({
      config,
      title: "Button",
      stories: [{ id: "button--default", name: "Default" }],
      manualRegion: "",
    });

    expect(content).toContain("// @generated-begin auto-screenshots");
    expect(content).toContain("// @generated-end auto-screenshots");
  });

  it("renders one nested describe per title segment", () => {
    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: ["components/**/__stories__/*.stories.tsx"],
      resolveSpecPath: ({ storyFilePath }) => storyFilePath.replace(".stories.tsx", ".spec.ts"),
    });

    const content = renderScreenshotSpec({
      config,
      title: "Components/Комментарии/CommentLine",
      stories: [
        { id: "components-комментарии-commentline--comment-line-story", name: "Comment line" },
      ],
      manualRegion: "",
    });

    expect(content).toBe(
      [
        "import { test, expect, switchStory } from '@crvy/strybk';",
        "",
        "// @generated-begin auto-screenshots",
        "test.describe('Components', () => {",
        "  test.describe('Комментарии', () => {",
        "    test.describe('CommentLine', () => {",
        "      test('Comment line', async ({ sharedPage, creevey }) => {",
        "        const { skip, reason, captureElement, ignoreElements } = creevey.params('components-комментарии-commentline--comment-line-story');",
        "        test.skip(skip, reason);",
        "        await switchStory(sharedPage, 'components-комментарии-commentline--comment-line-story');",
        "        const target = captureElement ? sharedPage.locator(captureElement) : sharedPage;",
        "        await expect(target).toHaveScreenshot({",
        "          mask: ignoreElements.map((selector) => sharedPage.locator(selector)),",
        "        });",
        "      });",
        "    });",
        "  });",
        "});",
        "// @generated-end auto-screenshots",
        "",
        "",
      ].join("\n"),
    );
  });

  it("drops empty title segments", () => {
    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: ["components/**/__stories__/*.stories.tsx"],
      resolveSpecPath: ({ storyFilePath }) => storyFilePath.replace(".stories.tsx", ".spec.ts"),
    });

    const content = renderScreenshotSpec({
      config,
      title: "Components//CommentLine/",
      stories: [{ id: "components-commentline--default", name: "Default" }],
      manualRegion: "",
    });

    expect(content).toContain("test.describe('Components', () => {");
    expect(content).toContain("  test.describe('CommentLine', () => {");
    expect(content).toContain("    test('Default', async ({ sharedPage, creevey }) => {");
    expect(content).not.toContain("describe('',");
  });

  it("escapes backslashes and single quotes in titles and story names", () => {
    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: ["components/**/__stories__/*.stories.tsx"],
      resolveSpecPath: ({ storyFilePath }) => storyFilePath.replace(".stories.tsx", ".spec.ts"),
    });

    const content = renderScreenshotSpec({
      config,
      title: "Foo\\ Bar's/Widget\\",
      stories: [{ id: "foo-bar-s-widget--it-s-alive\\", name: "It's alive\\" }],
      manualRegion: "",
    });

    expect(content).toContain("test.describe('Foo\\\\ Bar\\'s', () => {");
    expect(content).toContain("  test.describe('Widget\\\\', () => {");
    expect(content).toContain("    test('It\\'s alive\\\\', async ({ sharedPage, creevey }) => {");
  });
});

describe("generateScreenshots", () => {
  it("resolves relative storyGlobs against configDir regardless of process.cwd()", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "strybk-generate-"));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, "components", "__stories__", "Button.stories.tsx");
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      ["export default { title: 'Button' };", "export const Default = {};"].join("\n"),
    );

    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: ["components/**/*.stories.tsx"],
      resolveSpecPath: ({ storyFilePath: inputPath }) =>
        inputPath
          .replace("/__stories__/", "/__screenshots__/")
          .replace(".stories.tsx", ".screenshots.spec.ts"),
    });

    const outputs = await generateScreenshots({
      config,
      configDir: tempDir,
      indexEntries: [
        {
          id: "button--default",
          title: "Button",
          name: "Default",
          exportName: "Default",
          importPath: "./components/__stories__/Button.stories.tsx",
        },
      ],
      readExistingFile: () => null,
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.outputPath).toBe(
      storyFilePath
        .replace("/__stories__/", "/__screenshots__/")
        .replace(".stories.tsx", ".screenshots.spec.ts"),
    );
    expect(outputs[0]?.content).toContain("test.describe('Button'");
  });

  it("emits a test for every story regardless of creevey skip in source", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "strybk-generate-"));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, "components", "__stories__", "Button.stories.tsx");
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      [
        "export default { title: 'Button' };",
        "export const Default = {};",
        "Default.parameters = { creevey: { skip: true } };",
      ].join("\n"),
    );

    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: [join(tempDir, "components", "**", "*.stories.tsx")],
      resolveSpecPath: ({ storyFilePath: inputPath }) =>
        inputPath
          .replace("/__stories__/", "/__screenshots__/")
          .replace(".stories.tsx", ".screenshots.spec.ts"),
    });

    const outputs = await generateScreenshots({
      config,
      indexEntries: [
        {
          id: "button--default",
          title: "Button",
          name: "Default",
          exportName: "Default",
          importPath: "./components/__stories__/Button.stories.tsx",
        },
      ],
      readExistingFile: () => null,
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.content).toContain("await switchStory(sharedPage, 'button--default')");
  });

  it("generates specs for stories that rely on Storybook auto-titles via importPath", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "strybk-generate-"));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, "src", "components", "Button.stories.tsx");
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      ["export default { component: Button };", "export const Default = {};"].join("\n"),
    );

    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: [join(tempDir, "src", "**", "*.stories.tsx")],
      resolveSpecPath: ({ storyFilePath: inputPath }) =>
        inputPath.replace(/\.stories\.tsx$/u, ".spec.ts"),
    });

    const outputs = await generateScreenshots({
      config,
      configDir: tempDir,
      indexEntries: [
        {
          id: "components-button--default",
          title: "Components/Button",
          name: "Default",
          exportName: "Default",
          importPath: "./src/components/Button.stories.tsx",
        },
      ],
      readExistingFile: () => null,
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.outputPath).toBe(storyFilePath.replace(/\.stories\.tsx$/u, ".spec.ts"));
    expect(outputs[0]?.content).toContain("test.describe('Components', () => {");
    expect(outputs[0]?.content).toContain("  test.describe('Button', () => {");
    expect(outputs[0]?.content).toContain(
      "await switchStory(sharedPage, 'components-button--default')",
    );
  });

  it("drops files matched by the glob that have no corresponding index entry", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "strybk-generate-"));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, "src", "Orphan.stories.tsx");
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      ["export default { component: Orphan };", "export const Default = {};"].join("\n"),
    );

    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: [join(tempDir, "src", "**", "*.stories.tsx")],
      resolveSpecPath: ({ storyFilePath: inputPath }) =>
        inputPath.replace(/\.stories\.tsx$/u, ".spec.ts"),
    });

    const outputs = await generateScreenshots({
      config,
      configDir: tempDir,
      indexEntries: [],
      readExistingFile: () => null,
    });

    expect(outputs).toHaveLength(0);
  });
});
