export interface StoryPolicy {
  skip?: boolean;
}

export const FILE_POLICY_KEY = '__file__';

const skipWhitespace = (source: string, startIndex: number): number => {
  let index = startIndex;

  while (/\s/.test(source[index] ?? '')) {
    index += 1;
  }

  return index;
};

const extractObjectLiteral = (source: string, startIndex: number): string | null => {
  const objectStartIndex = skipWhitespace(source, startIndex);

  if (source[objectStartIndex] !== '{') {
    return null;
  }

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = objectStartIndex; index < source.length; index += 1) {
    const char = source[index] ?? '';
    const nextChar = source[index + 1] ?? '';
    const previousChar = source[index - 1] ?? '';

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }

      continue;
    }

    if (inBlockComment) {
      if (previousChar === '*' && char === '/') {
        inBlockComment = false;
      }

      continue;
    }

    if (inSingleQuote) {
      if (char === "'" && previousChar !== '\\') {
        inSingleQuote = false;
      }

      continue;
    }

    if (inDoubleQuote) {
      if (char === '"' && previousChar !== '\\') {
        inDoubleQuote = false;
      }

      continue;
    }

    if (inTemplateString) {
      if (char === '`' && previousChar !== '\\') {
        inTemplateString = false;
      }

      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === '`') {
      inTemplateString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(objectStartIndex, index + 1);
      }
    }
  }

  return null;
};

const extractSkipPolicy = (source: string | null, scope: 'parameters' | 'object'): StoryPolicy | undefined => {
  if (source === null) {
    return undefined;
  }

  const pattern =
    scope === 'parameters'
      ? /\bcreevey\s*:\s*\{[\s\S]*?\bskip\s*:\s*(true|false)\b/
      : /\bparameters\s*:\s*\{[\s\S]*?\bcreevey\s*:\s*\{[\s\S]*?\bskip\s*:\s*(true|false)\b/;
  const skipMatch = source.match(pattern);

  return skipMatch ? { skip: skipMatch[1] === 'true' } : undefined;
};

const collectPolicies = (
  source: string,
  pattern: RegExp,
  scope: 'parameters' | 'object',
): ReadonlyArray<readonly [number, string, StoryPolicy]> =>
  Array.from(source.matchAll(pattern)).flatMap((match) => {
    const index = match.index ?? 0;
    const policy = extractSkipPolicy(extractObjectLiteral(source, index + match[0].length), scope);

    return policy ? [[index, match[1], policy] as const] : [];
  });

export function extractCreeveyMetadata(source: string): Record<string, StoryPolicy> {
  const storyPolicies = [
    ...collectPolicies(source, /(\w+)\.parameters\s*=/g, 'parameters'),
    ...collectPolicies(source, /export\s+const\s+(\w+)(?:\s*:\s*[^=]+)?\s*=/g, 'object'),
  ];

  const constPolicies = new Map(
    collectPolicies(source, /const\s+(\w+)(?:\s*:\s*[^=]+)?\s*=/g, 'object').map(([, name, policy]) => [name, policy] as const),
  );

  const filePolicies = [
    ...Array.from(source.matchAll(/export\s+default\b/g)).flatMap((match) => {
      const index = match.index ?? 0;
      const policy = extractSkipPolicy(extractObjectLiteral(source, index + match[0].length), 'object');

      return policy ? [[index, FILE_POLICY_KEY, policy] as const] : [];
    }),
    ...Array.from(source.matchAll(/export\s+default\s+(\w+)\s*;/g)).flatMap((match) => {
      const policy = constPolicies.get(match[1]);

      return policy ? [[match.index ?? 0, FILE_POLICY_KEY, policy] as const] : [];
    }),
  ];

  return Object.fromEntries(
    [...storyPolicies, ...filePolicies]
      .sort((left, right) => left[0] - right[0])
      .map(([, name, policy]) => [name, policy] as const),
  );
}