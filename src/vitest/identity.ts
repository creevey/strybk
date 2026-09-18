/**
 * Browser identity and Storybook globals under Vitest Browser Mode.
 * Instances provide `strybkBrowser` and `strybkGlobals` through
 * per-instance `provide`; this layer resolves them with documented
 * fallbacks (identity defaults to `chromium`, absent globals are a no-op).
 */

import type { StorybookGlobals } from "../config.js";
import { toStorybookGlobals } from "../storybook/globals.js";

export const STRYBK_BROWSER_KEY = "strybkBrowser";
export const STRYBK_GLOBALS_KEY = "strybkGlobals";
export const DEFAULT_BROWSER_IDENTITY = "chromium";

declare module "vitest" {
  interface ProvidedContext {
    strybkBrowser?: unknown;
    strybkGlobals?: unknown;
  }
}

export interface StrybkIdentity {
  browser: string;
  globals: StorybookGlobals | undefined;
}

export type StrybkProvideKey = typeof STRYBK_BROWSER_KEY | typeof STRYBK_GLOBALS_KEY;

export type InjectValue = (key: StrybkProvideKey) => unknown;

export const resolveBrowserIdentity = (provided: unknown): string =>
  typeof provided === "string" && provided.length > 0 ? provided : DEFAULT_BROWSER_IDENTITY;

export const readStrybkIdentity = (injectValue: InjectValue): StrybkIdentity => ({
  browser: resolveBrowserIdentity(injectValue(STRYBK_BROWSER_KEY)),
  globals: toStorybookGlobals(injectValue(STRYBK_GLOBALS_KEY)),
});
