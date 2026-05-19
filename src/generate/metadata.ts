export interface StoryPolicy {
  skip?: boolean;
}

export function extractCreeveyMetadata(source: string): Record<string, StoryPolicy> {
  const parameterAssignments = source.matchAll(/(\w+)\.parameters\s*=\s*\{([\s\S]*?)\}\s*;/g);

  return Object.fromEntries(
    Array.from(parameterAssignments).flatMap((match) => {
      const skipMatch = match[2].match(/\bcreevey\s*:\s*\{[\s\S]*?\bskip\s*:\s*(true|false)\b/);

      return skipMatch ? [[match[1], { skip: skipMatch[1] === 'true' }]] : [];
    }),
  );
}