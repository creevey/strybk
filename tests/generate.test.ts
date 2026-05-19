import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { defineConfig, type StrybkConfig } from '../src/config.js';
import { generateScreenshots } from '../src/generate/index.js';
import { renderScreenshotSpec } from '../src/generate/render.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop() as string, { recursive: true, force: true });
  }
});

describe('renderScreenshotSpec', () => {
  it('renders generated tests and preserves the manual region', () => {
    const config = defineConfig({
      storybookUrl: 'http://localhost:6060',
      storyGlobs: ['components/**/__stories__/*.stories.tsx'],
      resolveSpecPath: ({ storyFilePath }) =>
        storyFilePath.replace('/__stories__/', '/__screenshots__/').replace('.stories.tsx', '.screenshots.spec.ts'),
      resolveHarnessImports: () => ({
        fixturesImport: '../../../__screenshots__/fixtures',
        switchStoryImport: '../../../__screenshots__/switchStory',
      }),
    });

    const content = renderScreenshotSpec({
      config,
      fixturesImport: '../../../__screenshots__/fixtures',
      switchStoryImport: '../../../__screenshots__/switchStory',
      title: 'Button',
      stories: [
        { id: 'button--default', name: 'Default' },
        { id: 'button--warning', name: 'Warning' },
      ],
      manualRegion: "test('hover', async ({ sharedPage }) => { await expect(sharedPage).toHaveScreenshot(); });",
    });

    expect(content).toContain("test.describe('Button'");
    expect(content).toContain("await switchStory(sharedPage, 'button--default')");
    expect(content).toContain('// @generated-end auto-screenshots');
    expect(content).toContain("test('hover'");
  });

  it('falls back to auto-screenshots markers when generatedRegionName is absent', () => {
    const config: StrybkConfig = {
      storybookUrl: 'http://localhost:6060',
      storyGlobs: ['components/**/__stories__/*.stories.tsx'],
      resolveSpecPath: ({ storyFilePath }) =>
        storyFilePath.replace('/__stories__/', '/__screenshots__/').replace('.stories.tsx', '.screenshots.spec.ts'),
      resolveHarnessImports: () => ({
        fixturesImport: '../../../__screenshots__/fixtures',
        switchStoryImport: '../../../__screenshots__/switchStory',
      }),
    };

    const content = renderScreenshotSpec({
      config,
      fixturesImport: '../../../__screenshots__/fixtures',
      switchStoryImport: '../../../__screenshots__/switchStory',
      title: 'Button',
      stories: [{ id: 'button--default', name: 'Default' }],
      manualRegion: '',
    });

    expect(content).toContain('// @generated-begin auto-screenshots');
    expect(content).toContain('// @generated-end auto-screenshots');
  });
});

describe('generateScreenshots', () => {
  it('keeps an output entry for an existing spec when creevey metadata filters out every story', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'strybk-generate-'));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, 'components', '__stories__', 'Button.stories.tsx');
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      [
        "export default { title: 'Button' };",
        'export const Default = {};',
        'Default.parameters = {',
        '  viewport: { defaultViewport: \"iphone\" },',
        '  creevey: { skip: true },',
        '};',
      ].join('\n'),
    );

    const outputPath = storyFilePath
      .replace('/__stories__/', '/__screenshots__/')
      .replace('.stories.tsx', '.screenshots.spec.ts');

    const config = defineConfig({
      storybookUrl: 'http://localhost:6060',
      storyGlobs: [join(tempDir, 'components', '**', '*.stories.tsx')],
      generatedRegionName: 'custom-generated-region',
      metadataExtractors: ['creevey'],
      resolveSpecPath: ({ storyFilePath: inputPath }) =>
        inputPath.replace('/__stories__/', '/__screenshots__/').replace('.stories.tsx', '.screenshots.spec.ts'),
      resolveHarnessImports: () => ({
        fixturesImport: '../../../__screenshots__/fixtures',
        switchStoryImport: '../../../__screenshots__/switchStory',
      }),
    });

    const outputs = await generateScreenshots({
      config,
      indexEntries: [{ id: 'button--default', title: 'Button', name: 'Default', exportName: 'Default' }],
      readExistingFile: (filePath) =>
        filePath === outputPath
          ? [
              "import { test, expect } from '../../../__screenshots__/fixtures';",
              "import { switchStory } from '../../../__screenshots__/switchStory';",
              '',
              '// @generated-begin custom-generated-region',
              "test.describe('Button', () => {",
              "  test('Default', async ({ sharedPage }) => {",
              "    await switchStory(sharedPage, 'button--default');",
              '    await expect(sharedPage).toHaveScreenshot();',
              '  });',
              '});',
              '// @generated-end custom-generated-region',
              '',
              "test('manual hover', async ({ sharedPage }) => {",
              '  await expect(sharedPage).toHaveScreenshot();',
              '});',
            ].join('\n')
          : null,
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.outputPath).toBe(outputPath);
    expect(outputs[0]?.content).toContain('// @generated-begin custom-generated-region');
    expect(outputs[0]?.content).toContain("test.describe('Button', () => {\n\n});");
    expect(outputs[0]?.content).not.toContain("await switchStory(sharedPage, 'button--default')");
    expect(outputs[0]?.content).toContain("test('manual hover'");
  });

  it('keeps an output entry for an existing spec when file-level creevey metadata filters out every story', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'strybk-generate-'));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, 'components', '__stories__', 'Toast.stories.tsx');
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      [
        'export default {',
        "  title: 'Toast',",
        '  parameters: { creevey: { skip: true } },',
        '};',
        'export const Default = {};',
        'export const Warning = {};',
      ].join('\n'),
    );

    const outputPath = storyFilePath
      .replace('/__stories__/', '/__screenshots__/')
      .replace('.stories.tsx', '.screenshots.spec.ts');

    const config = defineConfig({
      storybookUrl: 'http://localhost:6060',
      storyGlobs: [join(tempDir, 'components', '**', '*.stories.tsx')],
      generatedRegionName: 'custom-generated-region',
      metadataExtractors: ['creevey'],
      resolveSpecPath: ({ storyFilePath: inputPath }) =>
        inputPath.replace('/__stories__/', '/__screenshots__/').replace('.stories.tsx', '.screenshots.spec.ts'),
      resolveHarnessImports: () => ({
        fixturesImport: '../../../__screenshots__/fixtures',
        switchStoryImport: '../../../__screenshots__/switchStory',
      }),
    });

    const outputs = await generateScreenshots({
      config,
      indexEntries: [
        { id: 'toast--default', title: 'Toast', name: 'Default', exportName: 'Default' },
        { id: 'toast--warning', title: 'Toast', name: 'Warning', exportName: 'Warning' },
      ],
      readExistingFile: (filePath) =>
        filePath === outputPath
          ? [
              "import { test, expect } from '../../../__screenshots__/fixtures';",
              "import { switchStory } from '../../../__screenshots__/switchStory';",
              '',
              '// @generated-begin custom-generated-region',
              "test.describe('Toast', () => {",
              "  test('Default', async ({ sharedPage }) => {",
              "    await switchStory(sharedPage, 'toast--default');",
              '    await expect(sharedPage).toHaveScreenshot();',
              '  });',
              '});',
              '// @generated-end custom-generated-region',
              '',
              "test('manual hover', async ({ sharedPage }) => {",
              '  await expect(sharedPage).toHaveScreenshot();',
              '});',
            ].join('\n')
          : null,
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.outputPath).toBe(outputPath);
    expect(outputs[0]?.content).toContain('// @generated-begin custom-generated-region');
    expect(outputs[0]?.content).toContain("test.describe('Toast', () => {\n\n});");
    expect(outputs[0]?.content).not.toContain("await switchStory(sharedPage, 'toast--default')");
    expect(outputs[0]?.content).not.toContain("await switchStory(sharedPage, 'toast--warning')");
    expect(outputs[0]?.content).toContain("test('manual hover'");
  });

  it('filters per-story creevey skips by story id when Storybook index entries omit exportName', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'strybk-generate-'));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, 'components', '__stories__', 'Baseline.stories.tsx');
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      [
        "export default { title: 'Baseline' };",
        'export const ButtonWithoutContentInFlex = {};',
        'ButtonWithoutContentInFlex.parameters = { creevey: { skip: true } };',
        'export const InputWithButton = {};',
      ].join('\n'),
    );

    const config = defineConfig({
      storybookUrl: 'http://localhost:6060',
      storyGlobs: [join(tempDir, 'components', '**', '*.stories.tsx')],
      metadataExtractors: ['creevey'],
      resolveSpecPath: ({ storyFilePath: inputPath }) =>
        inputPath.replace('/__stories__/', '/__screenshots__/').replace('.stories.tsx', '.screenshots.spec.ts'),
      resolveHarnessImports: () => ({
        fixturesImport: '../../../__screenshots__/fixtures',
        switchStoryImport: '../../../__screenshots__/switchStory',
      }),
    });

    const outputs = await generateScreenshots({
      config,
      indexEntries: [
        { id: 'baseline--button-without-content-in-flex', title: 'Baseline', name: 'Button without content in flex-container' },
        { id: 'baseline--input-with-button', title: 'Baseline', name: 'Input with button' },
      ],
      readExistingFile: () => null,
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.content).not.toContain("await switchStory(sharedPage, 'baseline--button-without-content-in-flex')");
    expect(outputs[0]?.content).toContain("await switchStory(sharedPage, 'baseline--input-with-button')");
  });

  it('omits a fully skipped existing spec when no manual region remains', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'strybk-generate-'));
    temporaryDirectories.push(tempDir);

    const storyFilePath = join(tempDir, 'components', '__stories__', 'Center.stories.tsx');
    mkdirSync(dirname(storyFilePath), { recursive: true });
    writeFileSync(
      storyFilePath,
      [
        'export default {',
        "  title: 'Center',",
        '  parameters: { creevey: { skip: true } },',
        '};',
        'export const Simple = {};',
      ].join('\n'),
    );

    const outputPath = storyFilePath
      .replace('/__stories__/', '/__screenshots__/')
      .replace('.stories.tsx', '.screenshots.spec.ts');

    const config = defineConfig({
      storybookUrl: 'http://localhost:6060',
      storyGlobs: [join(tempDir, 'components', '**', '*.stories.tsx')],
      metadataExtractors: ['creevey'],
      resolveSpecPath: ({ storyFilePath: inputPath }) =>
        inputPath.replace('/__stories__/', '/__screenshots__/').replace('.stories.tsx', '.screenshots.spec.ts'),
      resolveHarnessImports: () => ({
        fixturesImport: '../../../__screenshots__/fixtures',
        switchStoryImport: '../../../__screenshots__/switchStory',
      }),
    });

    const outputs = await generateScreenshots({
      config,
      indexEntries: [{ id: 'center--simple', title: 'Center', name: 'simple' }],
      readExistingFile: (filePath) =>
        filePath === outputPath
          ? [
              "import { test, expect } from '../../../__screenshots__/fixtures';",
              "import { switchStory } from '../../../__screenshots__/switchStory';",
              '',
              '// @generated-begin auto-screenshots',
              "test.describe('Center', () => {",
              "  test('simple', async ({ sharedPage }) => {",
              "    await switchStory(sharedPage, 'center--simple');",
              '    await expect(sharedPage).toHaveScreenshot();',
              '  });',
              '});',
              '// @generated-end auto-screenshots',
            ].join('\n')
          : null,
    });

    expect(outputs).toHaveLength(0);
  });
});