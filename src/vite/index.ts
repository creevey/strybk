/**
 * Vite plugin that mounts a built Storybook origin under a reserved prefix
 * on the Vitest dev server, so the runtime's embedded preview iframe is
 * same-origin. Plain-object plugin: no `vite` runtime dependency — `vite`
 * is a type-only import.
 */

import type { Plugin } from "vite";

export interface StrybkStorybookProxyOptions {
  /**
   * Origin serving `storybook build` output (for example a static server).
   * Dev-mode Storybook servers are not supported: their asset URLs are
   * absolute vite dev paths that cannot resolve under the prefix.
   */
  target: string;
  prefix?: string;
}

export const DEFAULT_PROXY_PREFIX = "/storybook";

const normalizePrefix = (prefix: string): string => {
  const withLeadingSlash = prefix.startsWith("/") ? prefix : `/${prefix}`;

  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
};

const unreachableUpstreamMessage = (target: string, reason: string): string =>
  `strybk: Storybook proxy target ${target} is unreachable (${reason}). Run \`storybook build\`, serve the output, and point the plugin at that origin; dev-mode Storybook servers are not supported under Vitest.`;

export const strybkStorybookProxy = (options: StrybkStorybookProxyOptions): Plugin => {
  if (options.target.length === 0) {
    throw new Error("strybkStorybookProxy requires the built Storybook origin as `target`");
  }

  const prefix = normalizePrefix(options.prefix ?? DEFAULT_PROXY_PREFIX);
  const target = options.target;

  return {
    name: "strybk-storybook-proxy",
    config: () => ({
      server: {
        proxy: {
          [prefix]: {
            target,
            changeOrigin: true,
            rewrite: (path: string): string => path.slice(prefix.length) || "/",
            configure: (proxy): void => {
              proxy.on("error", (error, _request, response): void => {
                if ("writeHead" in response) {
                  response.writeHead(502);
                  response.end(unreachableUpstreamMessage(target, error.message));
                }
              });
            },
          },
        },
      },
    }),
  };
};
