/**
 * Pure assertion translation between the generated Playwright-vocabulary
 * calls (`expect(target).toHaveScreenshot({ mask })`) and Vitest Browser
 * Mode's `toMatchScreenshot`. Mirrors vitest's own screenshot-name
 * sanitization so baseline filenames stay deterministic across runs.
 */

export interface ToHaveScreenshotOptions {
  mask?: readonly unknown[];
}

export interface MatchScreenshotOptions<Locator = unknown> {
  comparatorOptions?: {
    threshold?: number;
  };
  screenshotOptions?: {
    animations?: "allow" | "disabled";
    scale?: "css" | "device";
    mask?: Locator[];
  };
}

export const sanitizeScreenshotName = (name: string): string =>
  name
    .replace(/\s+/gu, "-")
    .replace(/[^\w-]+/gu, "")
    .replace(/-{2,}/gu, "-");

export const toScreenshotName = (fullName: readonly string[]): string =>
  sanitizeScreenshotName(fullName.join(" > "));

export const toMatchScreenshotOptions = <Locator>(
  options: ToHaveScreenshotOptions,
  toPreviewLocator: (entry: unknown) => Locator,
): MatchScreenshotOptions<Locator> => ({
  comparatorOptions: { threshold: 0.2 },
  screenshotOptions: {
    animations: "disabled",
    scale: "css",
    mask: options.mask?.map(toPreviewLocator) ?? [],
  },
});

export const resolveCaptureTarget = <Target>(args: {
  captureElement: string | null;
  elementTarget: (selector: string) => Target;
  viewportTarget: Target;
}): Target =>
  args.captureElement === null ? args.viewportTarget : args.elementTarget(args.captureElement);
