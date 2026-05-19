import { describe, expect, it } from 'vitest';

import { extractCreeveyMetadata } from '../src/generate/metadata.js';

describe('extractCreeveyMetadata', () => {
  it('marks stories with creevey skip as excluded', () => {
    const source = `
      export const Default = {};
      Default.parameters = { creevey: { skip: true } };
      export const Active = {};
    `;

    const metadata = extractCreeveyMetadata(source);

    expect(metadata.Default?.skip).toBe(true);
    expect(metadata.Active?.skip).toBeUndefined();
  });
});