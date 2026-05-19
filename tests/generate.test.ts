import { describe, expect, it } from 'vitest';

import { defineConfig, type StrybkConfig } from '../src/config.js';
import { renderScreenshotSpec } from '../src/generate/render.js';

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