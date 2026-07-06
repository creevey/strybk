export interface SerializedRegExp {
  __regexp: true;
  source: string;
  flags: string;
}

export const isSerializedRegExp = (value: unknown): value is SerializedRegExp =>
  typeof value === "object" && value !== null && Reflect.get(value, "__regexp") === true;

export const deserializeRegExp = ({ source, flags }: SerializedRegExp): RegExp =>
  new RegExp(source, flags);

export interface SkipOption {
  in?: string | string[] | RegExp | SerializedRegExp;
  kinds?: string | string[] | RegExp | SerializedRegExp;
  stories?: string | string[] | RegExp | SerializedRegExp;
}

export type SkipOptions = boolean | string | Record<string, SkipOption | SkipOption[]>;

const matchBy = (
  pattern: string | string[] | RegExp | SerializedRegExp | undefined,
  value: string,
): boolean =>
  (typeof pattern === "string" && pattern === value) ||
  (Array.isArray(pattern) && pattern.includes(value)) ||
  (pattern instanceof RegExp && pattern.test(value)) ||
  (isSerializedRegExp(pattern) && deserializeRegExp(pattern).test(value)) ||
  pattern === undefined;

const shouldSkipByOption = (
  browser: string,
  meta: { title: string; name: string },
  skipOption: SkipOption | SkipOption[],
  reason: string,
): boolean | string => {
  if (Array.isArray(skipOption)) {
    for (const option of skipOption) {
      const result = shouldSkipByOption(browser, meta, option, reason);

      if (result !== false) {
        return result;
      }
    }

    return false;
  }

  const { in: browsers, kinds, stories } = skipOption;
  const skipByBrowser = matchBy(browsers, browser);
  const skipByKind = matchBy(kinds, meta.title);
  const skipByStory = matchBy(stories, meta.name);

  return skipByBrowser && skipByKind && skipByStory && reason;
};

export const shouldSkip = (
  browser: string,
  meta: { title: string; name: string },
  skipOptions: SkipOptions,
): boolean | string => {
  if (typeof skipOptions !== "object") {
    return skipOptions;
  }

  for (const reason of Object.keys(skipOptions)) {
    const result = shouldSkipByOption(browser, meta, skipOptions[reason], reason);

    if (result !== false) {
      return result;
    }
  }

  return false;
};

export interface CreeveyStoryParams {
  captureElement?: string | null;
  ignoreElements?: string | string[] | null;
  skip?: SkipOptions;
}

export interface NormalizedCreeveyParams {
  skip: boolean;
  reason?: string;
  captureElement: string | null;
  ignoreElements: string[];
}

export interface StoriesRaw {
  [storyId: string]: {
    title: string;
    name: string;
    parameters?: { creevey?: CreeveyStoryParams };
  };
}

export interface CreeveyApi {
  params(storyId: string): NormalizedCreeveyParams;
}

const toArray = (value: string | string[] | null | undefined): string[] => {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

export const normalizeCreeveyParams = (
  raw: CreeveyStoryParams | undefined,
  browser: string,
  meta: { title: string; name: string },
): NormalizedCreeveyParams => {
  if (raw === undefined) {
    return { skip: false, captureElement: null, ignoreElements: [] };
  }

  const skipResult = raw.skip === undefined ? false : shouldSkip(browser, meta, raw.skip);

  return {
    skip: skipResult !== false,
    reason: typeof skipResult === "string" ? skipResult : undefined,
    captureElement: raw.captureElement === undefined ? null : raw.captureElement,
    ignoreElements: toArray(raw.ignoreElements),
  };
};

export const resolveCreeveyStory = (
  stories: StoriesRaw,
  storyId: string,
  browser: string,
): NormalizedCreeveyParams => {
  const story = stories[storyId];

  if (story === undefined) {
    throw new Error(`Story '${storyId}' not found in extracted Storybook stories`);
  }

  return normalizeCreeveyParams(story.parameters?.creevey, browser, {
    title: story.title,
    name: story.name,
  });
};
