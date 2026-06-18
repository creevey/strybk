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
    expect(content).toContain("await switchStory(sharedPage, 'button--default')");
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

  it("keeps an output entry for an existing spec when creevey metadata filters out every story", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "strybk-generate-"));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, "components", "__stories__", "Button.stories.tsx");
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      [
        "export default { title: 'Button' };",
        "export const Default = {};",
        "Default.parameters = {",
        '  viewport: { defaultViewport: "iphone" },',
        "  creevey: { skip: true },",
        "};",
      ].join("\n"),
    );

    const outputPath = storyFilePath
      .replace("/__stories__/", "/__screenshots__/")
      .replace(".stories.tsx", ".screenshots.spec.ts");

    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: [join(tempDir, "components", "**", "*.stories.tsx")],
      generatedRegionName: "custom-generated-region",
      metadataExtractors: ["creevey"],
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
      readExistingFile: (filePath) =>
        filePath === outputPath
          ? [
              "import { test, expect, switchStory } from '@crvy/strybk';",
              "",
              "// @generated-begin custom-generated-region",
              "test.describe('Button', () => {",
              "  test('Default', async ({ sharedPage }) => {",
              "    await switchStory(sharedPage, 'button--default');",
              "    await expect(sharedPage).toHaveScreenshot();",
              "  });",
              "});",
              "// @generated-end custom-generated-region",
              "",
              "test('manual hover', async ({ sharedPage }) => {",
              "  await expect(sharedPage).toHaveScreenshot();",
              "});",
            ].join("\n")
          : null,
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.outputPath).toBe(outputPath);
    expect(outputs[0]?.content).toContain("// @generated-begin custom-generated-region");
    expect(outputs[0]?.content).toContain("test.describe('Button', () => {\n\n});");
    expect(outputs[0]?.content).not.toContain("await switchStory(sharedPage, 'button--default')");
    expect(outputs[0]?.content).toContain("test('manual hover'");
  });

  it("keeps an output entry for an existing spec when file-level creevey metadata filters out every story", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "strybk-generate-"));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, "components", "__stories__", "Toast.stories.tsx");
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      [
        "export default {",
        "  title: 'Toast',",
        "  parameters: { creevey: { skip: true } },",
        "};",
        "export const Default = {};",
        "export const Warning = {};",
      ].join("\n"),
    );

    const outputPath = storyFilePath
      .replace("/__stories__/", "/__screenshots__/")
      .replace(".stories.tsx", ".screenshots.spec.ts");

    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: [join(tempDir, "components", "**", "*.stories.tsx")],
      generatedRegionName: "custom-generated-region",
      metadataExtractors: ["creevey"],
      resolveSpecPath: ({ storyFilePath: inputPath }) =>
        inputPath
          .replace("/__stories__/", "/__screenshots__/")
          .replace(".stories.tsx", ".screenshots.spec.ts"),
    });

    const outputs = await generateScreenshots({
      config,
      indexEntries: [
        {
          id: "toast--default",
          title: "Toast",
          name: "Default",
          exportName: "Default",
          importPath: "./components/__stories__/Toast.stories.tsx",
        },
        {
          id: "toast--warning",
          title: "Toast",
          name: "Warning",
          exportName: "Warning",
          importPath: "./components/__stories__/Toast.stories.tsx",
        },
      ],
      readExistingFile: (filePath) =>
        filePath === outputPath
          ? [
              "import { test, expect, switchStory } from '@crvy/strybk';",
              "",
              "// @generated-begin custom-generated-region",
              "test.describe('Toast', () => {",
              "  test('Default', async ({ sharedPage }) => {",
              "    await switchStory(sharedPage, 'toast--default');",
              "    await expect(sharedPage).toHaveScreenshot();",
              "  });",
              "});",
              "// @generated-end custom-generated-region",
              "",
              "test('manual hover', async ({ sharedPage }) => {",
              "  await expect(sharedPage).toHaveScreenshot();",
              "});",
            ].join("\n")
          : null,
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.outputPath).toBe(outputPath);
    expect(outputs[0]?.content).toContain("// @generated-begin custom-generated-region");
    expect(outputs[0]?.content).toContain("test.describe('Toast', () => {\n\n});");
    expect(outputs[0]?.content).not.toContain("await switchStory(sharedPage, 'toast--default')");
    expect(outputs[0]?.content).not.toContain("await switchStory(sharedPage, 'toast--warning')");
    expect(outputs[0]?.content).toContain("test('manual hover'");
  });

  it("filters per-story creevey skips by story id when Storybook index entries omit exportName", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "strybk-generate-"));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, "components", "__stories__", "Baseline.stories.tsx");
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      [
        "export default { title: 'Baseline' };",
        "export const ButtonWithoutContentInFlex = {};",
        "ButtonWithoutContentInFlex.parameters = { creevey: { skip: true } };",
        "export const InputWithButton = {};",
      ].join("\n"),
    );

    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: [join(tempDir, "components", "**", "*.stories.tsx")],
      metadataExtractors: ["creevey"],
      resolveSpecPath: ({ storyFilePath: inputPath }) =>
        inputPath
          .replace("/__stories__/", "/__screenshots__/")
          .replace(".stories.tsx", ".screenshots.spec.ts"),
    });

    const outputs = await generateScreenshots({
      config,
      indexEntries: [
        {
          id: "baseline--button-without-content-in-flex",
          title: "Baseline",
          name: "Button without content in flex-container",
          importPath: "./components/__stories__/Baseline.stories.tsx",
        },
        {
          id: "baseline--input-with-button",
          title: "Baseline",
          name: "Input with button",
          importPath: "./components/__stories__/Baseline.stories.tsx",
        },
      ],
      readExistingFile: () => null,
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.content).not.toContain(
      "await switchStory(sharedPage, 'baseline--button-without-content-in-flex')",
    );
    expect(outputs[0]?.content).toContain(
      "await switchStory(sharedPage, 'baseline--input-with-button')",
    );
  });

  it("omits a fully skipped existing spec when no manual region remains", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "strybk-generate-"));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, "components", "__stories__", "Center.stories.tsx");
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      [
        "export default {",
        "  title: 'Center',",
        "  parameters: { creevey: { skip: true } },",
        "};",
        "export const Simple = {};",
      ].join("\n"),
    );

    const outputPath = storyFilePath
      .replace("/__stories__/", "/__screenshots__/")
      .replace(".stories.tsx", ".screenshots.spec.ts");

    const config = defineConfig({
      storybookUrl: "http://localhost:6060",
      storyGlobs: [join(tempDir, "components", "**", "*.stories.tsx")],
      metadataExtractors: ["creevey"],
      resolveSpecPath: ({ storyFilePath: inputPath }) =>
        inputPath
          .replace("/__stories__/", "/__screenshots__/")
          .replace(".stories.tsx", ".screenshots.spec.ts"),
    });

    const outputs = await generateScreenshots({
      config,
      indexEntries: [
        {
          id: "center--simple",
          title: "Center",
          name: "simple",
          importPath: "./components/__stories__/Center.stories.tsx",
        },
      ],
      readExistingFile: (filePath) =>
        filePath === outputPath
          ? [
              "import { test, expect, switchStory } from '@crvy/strybk';",
              "",
              "// @generated-begin auto-screenshots",
              "test.describe('Center', () => {",
              "  test('simple', async ({ sharedPage }) => {",
              "    await switchStory(sharedPage, 'center--simple');",
              "    await expect(sharedPage).toHaveScreenshot();",
              "  });",
              "});",
              "// @generated-end auto-screenshots",
            ].join("\n")
          : null,
    });

    expect(outputs).toHaveLength(0);
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
    expect(outputs[0]?.content).toContain("test.describe('Components/Button'");
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
