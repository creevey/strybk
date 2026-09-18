/**
 * Styles injected into the Storybook preview to keep screenshots
 * deterministic. Shared by the Playwright and Vitest runtime branches.
 */
export const animationDisablerStyles = [
  "*, *::before, *::after {",
  "  animation: none !important;",
  "  caret-color: transparent !important;",
  "  cursor: none !important;",
  "  transition: none !important;",
  "}",
  "html {",
  "  scroll-behavior: auto !important;",
  "}",
].join("\n");
