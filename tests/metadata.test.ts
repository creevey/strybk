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

  it('marks stories with creevey skip when parameters include sibling fields before creevey', () => {
    const source = `
      export const MobileSimple = {};
      MobileSimple.parameters = {
        viewport: {
          defaultViewport: 'iphone',
        },
        creevey: { skip: true },
      };
    `;

    const metadata = extractCreeveyMetadata(source);

    expect(metadata.MobileSimple?.skip).toBe(true);
  });
});