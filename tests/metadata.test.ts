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

  it('applies export-default meta creevey skip to every story in the file', () => {
    const source = `
      export default {
        title: 'ToastView',
        parameters: { creevey: { skip: true } },
      };

      export const Default = {};
      export const Warning = {};
    `;

    const metadata = extractCreeveyMetadata(source);

    expect(metadata.__file__?.skip).toBe(true);
  });

  it('applies exported meta constant creevey skip to every story in the file', () => {
    const source = `
      const meta: Meta = {
        title: 'Center',
        parameters: { creevey: { skip: true } },
      };

      export default meta;
      export const Default = {};
      export const Active = {};
    `;

    const metadata = extractCreeveyMetadata(source);

    expect(metadata.__file__?.skip).toBe(true);
  });

  it('marks CSF story objects with inline creevey skip as excluded', () => {
    const source = `
      export const Default = {
        args: {
          size: 'medium',
        },
        parameters: {
          creevey: { skip: true },
        },
      };

      export const Active = {};
    `;

    const metadata = extractCreeveyMetadata(source);

    expect(metadata.Default?.skip).toBe(true);
    expect(metadata.Active?.skip).toBeUndefined();
  });
});