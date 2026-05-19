import { createRequire } from 'node:module';
import { resolve } from 'node:path';

export const loadPlaywrightTestRuntime = (): typeof import('@playwright/test') => {
  const requireFromCwd = createRequire(resolve(process.cwd(), 'package.json'));

  return requireFromCwd('@playwright/test') as typeof import('@playwright/test');
};