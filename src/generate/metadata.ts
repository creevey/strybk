export interface StoryPolicy {
  skip?: boolean;
}

export function extractCreeveyMetadata(source: string): Record<string, StoryPolicy> {
  const matches = source.matchAll(/(\w+)\.parameters\s*=\s*\{\s*creevey:\s*\{\s*skip:\s*(true|false)/g);

  return Object.fromEntries(
    Array.from(matches, (match) => [match[1], { skip: match[2] === 'true' }]),
  );
}