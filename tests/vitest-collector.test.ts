import { describe, expect, it } from "bun:test";

import { assembleTestCollector } from "../src/vitest/collector.js";

interface FakeCollector {
  (...args: never[]): unknown;
  [member: string]: unknown;
}

const collectorWith = (members: Record<string, unknown>): FakeCollector =>
  Object.assign((): void => undefined, members);

const noop = (): void => undefined;

describe("assembleTestCollector", () => {
  it("falls back to the supplied describe when the extended collector has none", () => {
    const collector = collectorWith({});
    const assembled = assembleTestCollector({
      collector,
      extended: collectorWith({ skip: noop }),
      fallbackDescribe: noop,
      skip: noop,
    });

    expect(assembled).toBe(collector);
    expect(assembled.describe).toBe(noop);
  });

  it("keeps the extended collector's own describe", () => {
    const ownDescribe = (): void => undefined;
    const assembled = assembleTestCollector({
      collector: collectorWith({}),
      extended: collectorWith({ describe: ownDescribe }),
      fallbackDescribe: noop,
      skip: noop,
    });

    expect(assembled.describe).toBe(ownDescribe);
  });

  it("lets the skip override win over the extended collector's skip", () => {
    const overrideSkip = (): void => undefined;
    const assembled = assembleTestCollector({
      collector: collectorWith({}),
      extended: collectorWith({ skip: noop }),
      fallbackDescribe: noop,
      skip: overrideSkip,
    });

    expect(assembled.skip).toBe(overrideSkip);
  });

  it("copies the remaining own members", () => {
    const only = (): void => undefined;
    const todo = (): void => undefined;
    const each = (): void => undefined;
    const assembled = assembleTestCollector({
      collector: collectorWith({}),
      extended: collectorWith({ only, todo, each }),
      fallbackDescribe: noop,
      skip: noop,
    });

    expect(assembled.only).toBe(only);
    expect(assembled.todo).toBe(todo);
    expect(assembled.each).toBe(each);
  });
});
