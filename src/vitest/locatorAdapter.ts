/**
 * The portable locator subset over a vitest browser locator. This module
 * imports types only, so the in-gate test suite can drive it with a fake
 * locator while `pageAdapter.ts` does the vitest-coupled wiring.
 */

import type {
  UserEventClearOptions,
  UserEventClickOptions,
  UserEventDoubleClickOptions,
  UserEventDragAndDropOptions,
  UserEventFillOptions,
  UserEventHoverOptions,
  UserEventTypeOptions,
} from "vitest/browser";

export interface DragToOptions {
  sourcePosition?: { x: number; y: number };
  targetPosition?: { x: number; y: number };
  force?: boolean;
  timeout?: number;
}

export interface PortableLocatorSource {
  readonly selector: string;
  click(options?: UserEventClickOptions): Promise<void>;
  dblClick(options?: UserEventDoubleClickOptions): Promise<void>;
  hover(options?: UserEventHoverOptions): Promise<void>;
  clear(options?: UserEventClearOptions): Promise<void>;
  fill(text: string, options?: UserEventFillOptions): Promise<void>;
  dropTo(target: PortableLocatorSource, options?: UserEventDragAndDropOptions): Promise<void>;
  nth(index: number): this;
  first(): this;
  last(): this;
  getByCSS(selector: string): this;
}

/** The `userEvent` surface `press` and `type` need, injected by the adapter. */
export interface PortableUserEvent<TLocator> {
  type(element: TLocator, text: string, options?: UserEventTypeOptions): Promise<void>;
}

export interface PortableLocator<TLocator extends PortableLocatorSource = PortableLocatorSource> {
  readonly selector: string;
  readonly vitestLocator: TLocator;
  click(options?: UserEventClickOptions): Promise<void>;
  dblClick(options?: UserEventDoubleClickOptions): Promise<void>;
  hover(options?: UserEventHoverOptions): Promise<void>;
  clear(options?: UserEventClearOptions): Promise<void>;
  fill(text: string, options?: UserEventFillOptions): Promise<void>;
  press(key: string, options?: UserEventTypeOptions): Promise<void>;
  type(text: string, options?: UserEventTypeOptions): Promise<void>;
  nth(index: number): PortableLocator<TLocator>;
  first(): PortableLocator<TLocator>;
  last(): PortableLocator<TLocator>;
  locator(selector: string): PortableLocator<TLocator>;
  dragTo(target: PortableLocator<TLocator>, options?: DragToOptions): Promise<void>;
}

/**
 * Converts a Playwright key chord into testing-library keyboard syntax, which
 * is what `userEvent.type` accepts: `Control+A` -> `{Control>}A{/Control}`.
 */
export const toKeyboardSyntax = (key: string): string => {
  const parts = key.split("+");
  const keyName = parts.at(-1) ?? "";
  const modifiers = parts.slice(0, -1);
  const renderedKey = keyName.length === 1 ? keyName : `{${keyName}}`;
  const open = modifiers.map((modifier) => `{${modifier}>}`).join("");
  const close = [...modifiers]
    .reverse()
    .map((modifier) => `{/${modifier}}`)
    .join("");

  return `${open}${renderedKey}${close}`;
};

export interface PortableLocatorOptions<TLocator extends PortableLocatorSource> {
  selector: string;
  vitestLocator: TLocator;
  userEvent: PortableUserEvent<NoInfer<TLocator>>;
}

class PortableLocatorAdapter<
  TLocator extends PortableLocatorSource,
> implements PortableLocator<TLocator> {
  readonly selector: string;
  readonly vitestLocator: TLocator;
  private readonly userEvent: PortableUserEvent<TLocator>;

  constructor(options: PortableLocatorOptions<TLocator>) {
    this.selector = options.selector;
    this.vitestLocator = options.vitestLocator;
    this.userEvent = options.userEvent;
  }

  click(options?: UserEventClickOptions): Promise<void> {
    return this.vitestLocator.click(options);
  }

  dblClick(options?: UserEventDoubleClickOptions): Promise<void> {
    return this.vitestLocator.dblClick(options);
  }

  hover(options?: UserEventHoverOptions): Promise<void> {
    return this.vitestLocator.hover(options);
  }

  clear(options?: UserEventClearOptions): Promise<void> {
    return this.vitestLocator.clear(options);
  }

  fill(text: string, options?: UserEventFillOptions): Promise<void> {
    return this.vitestLocator.fill(text, options);
  }

  press(key: string, options?: UserEventTypeOptions): Promise<void> {
    return this.userEvent.type(this.vitestLocator, toKeyboardSyntax(key), options);
  }

  type(text: string, options?: UserEventTypeOptions): Promise<void> {
    return this.userEvent.type(this.vitestLocator, text, options);
  }

  nth(index: number): PortableLocator<TLocator> {
    return this.wrap(this.vitestLocator.nth(index));
  }

  first(): PortableLocator<TLocator> {
    return this.wrap(this.vitestLocator.first());
  }

  last(): PortableLocator<TLocator> {
    return this.wrap(this.vitestLocator.last());
  }

  locator(selector: string): PortableLocator<TLocator> {
    return this.wrap(this.vitestLocator.getByCSS(selector));
  }

  dragTo(target: PortableLocator<TLocator>, options?: DragToOptions): Promise<void> {
    return this.vitestLocator.dropTo(target.vitestLocator, options);
  }

  private wrap(locator: TLocator): PortableLocator<TLocator> {
    return new PortableLocatorAdapter<TLocator>({
      selector: locator.selector,
      vitestLocator: locator,
      userEvent: this.userEvent,
    });
  }
}

export const createPortableLocator = <TLocator extends PortableLocatorSource>(
  options: PortableLocatorOptions<TLocator>,
): PortableLocator<TLocator> => new PortableLocatorAdapter(options);
