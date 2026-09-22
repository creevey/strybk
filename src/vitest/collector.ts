/**
 * Runner-agnostic assembly of the `test` collector exported by the Vitest
 * runtime. Imports nothing from `vitest` so the in-gate test suite can drive
 * the assembly that `src/vitest/index.ts` wires to the runner.
 */

type CollectorFunction = (...args: never[]) => unknown;

const reservedKeys = new Set(["describe", "skip", "length", "name", "arguments", "caller"]);

export interface AssembleCollectorOptions<TCollector extends CollectorFunction> {
  /** Bound collector to equip and return. */
  collector: TCollector;
  /** Collector returned by `test.extend()`; its own members are carried over. */
  extended: object;
  /** Vitest's `describe`, used when the extended collector has none. */
  fallbackDescribe: unknown;
  /** Bridge that must win over the extended collector's `skip`. */
  skip: unknown;
}

export function assembleTestCollector<TCollector extends CollectorFunction>(
  options: AssembleCollectorOptions<TCollector>,
): TCollector {
  const ownDescribe: unknown = Object.getOwnPropertyDescriptor(options.extended, "describe")?.value;

  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(options.extended),
  )) {
    if (!reservedKeys.has(key)) {
      Object.defineProperty(options.collector, key, descriptor);
    }
  }

  Object.defineProperty(options.collector, "skip", {
    value: options.skip,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(options.collector, "describe", {
    value: ownDescribe ?? options.fallbackDescribe,
    writable: true,
    configurable: true,
  });

  return options.collector;
}
