import { describe, expect, it } from "bun:test";

import { DEFAULT_PROXY_PREFIX, strybkStorybookProxy } from "../src/vite/index.js";

interface ProxyServerLike {
  on(event: string, listener: (...args: unknown[]) => void): void;
}

interface ProxyEntry {
  target: string;
  rewrite?: (path: string) => string;
  bypass?: unknown;
  selfHandleResponse?: boolean;
  configure?: (proxy: unknown) => void;
}

interface PluginConfig {
  server?: {
    proxy?: Record<string, ProxyEntry>;
  };
}

const pluginConfig = (args: { target: string; prefix?: string }): PluginConfig => {
  const plugin = strybkStorybookProxy(
    args.prefix === undefined
      ? { target: args.target }
      : { target: args.target, prefix: args.prefix },
  );
  const configHook = plugin.config as unknown as () => PluginConfig;

  return configHook();
};

const proxyEntry = (args: { target: string; prefix?: string }): ProxyEntry => {
  const entries = Object.values(pluginConfig(args).server?.proxy ?? {});
  const entry = entries[0];

  if (entry === undefined) {
    throw new Error("Expected a proxy entry for the prefix");
  }

  return entry;
};

describe("strybkStorybookProxy config", () => {
  it("returns a named plain-object plugin", () => {
    const plugin = strybkStorybookProxy({ target: "http://127.0.0.1:6007" });

    expect(typeof plugin).toBe("object");
    expect(plugin.name).toBe("strybk-storybook-proxy");
    expect(typeof plugin.config).toBe("function");
  });

  it("mounts the proxy under the default /storybook prefix", () => {
    expect(DEFAULT_PROXY_PREFIX).toBe("/storybook");

    const entry = proxyEntry({ target: "http://127.0.0.1:6007" });

    expect(entry.target).toBe("http://127.0.0.1:6007");
  });

  it("accepts a configurable prefix and normalizes slashes", () => {
    expect(proxyEntry({ target: "http://127.0.0.1:6007", prefix: "/sb/" }).target).toBe(
      "http://127.0.0.1:6007",
    );
    expect(proxyEntry({ target: "http://127.0.0.1:6007", prefix: "sb" }).target).toBe(
      "http://127.0.0.1:6007",
    );

    const config = pluginConfig({ target: "http://127.0.0.1:6007", prefix: "/sb/" });

    expect(Object.keys(config.server?.proxy ?? {})).toEqual(["/sb"]);
  });

  it("rewrites prefix requests to origin-relative paths", () => {
    const entry = proxyEntry({ target: "http://127.0.0.1:6007" });

    expect(entry.rewrite?.("/storybook/iframe.html?id=a--b&viewMode=story")).toBe(
      "/iframe.html?id=a--b&viewMode=story",
    );
    expect(entry.rewrite?.("/storybook")).toBe("/");
  });

  it("keeps upstream responses flowing through untouched", () => {
    const entry = proxyEntry({ target: "http://127.0.0.1:6007" });

    expect(entry.bypass).toBeUndefined();
    expect(entry.selfHandleResponse).not.toBe(true);
  });

  it("requires a target origin", () => {
    let rejection: unknown;

    try {
      strybkStorybookProxy({ target: "" });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);

    if (rejection instanceof Error) {
      expect(rejection.message).toContain("target");
    }
  });
});

describe("upstream failure path", () => {
  it("responds 502 with an actionable message when the origin is unreachable", () => {
    const entry = proxyEntry({ target: "http://127.0.0.1:6007" });
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const proxy: ProxyServerLike = {
      on(event, listener): void {
        listeners.set(event, listener);
      },
    };

    entry.configure?.(proxy);

    const errorHandler = listeners.get("error");

    expect(errorHandler).toBeDefined();

    const statuses: number[] = [];
    const bodies: string[] = [];
    const response = {
      writeHead: (status: number): void => {
        statuses.push(status);
      },
      end: (body: string): void => {
        bodies.push(body);
      },
    };

    errorHandler?.(new Error("connect ECONNREFUSED 127.0.0.1:6007"), {}, response);

    expect(statuses).toEqual([502]);
    expect(bodies[0]).toContain("http://127.0.0.1:6007");
    expect(bodies[0]).toContain("storybook build");
  });
});
