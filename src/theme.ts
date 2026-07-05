/**
 * Fluent UI v9 theme for the "Operational Violet" design direction.
 * Brand ramp derived from Operational Violet #5B3CC4 (lands at brand.80).
 * See docs/ui-concept.html and the design-direction memory for semantics.
 */

import {
  createLightTheme,
  createDarkTheme,
  type BrandVariants,
  type Theme,
} from "@fluentui/react-components";

export const operationalViolet: BrandVariants = {
  10: "#070311",
  20: "#100826",
  30: "#190F46",
  40: "#21155C",
  50: "#2A1B72",
  60: "#341F86",
  70: "#472A9C",
  80: "#5B3CC4", // Operational Violet — primary
  90: "#6E51CE",
  100: "#8168D6",
  110: "#957FDE",
  120: "#A997E6",
  130: "#BDAFEE",
  140: "#D2C7F5",
  150: "#E7E0FB",
  160: "#F5F3FF", // Lavender surface
};

export const lightTheme: Theme = {
  ...createLightTheme(operationalViolet),
};

export const darkTheme: Theme = {
  ...createDarkTheme(operationalViolet),
};

/** Semantic status colours (separate from the brand accent). */
export const statusColors = {
  ready: { light: "#107C10", dark: "#57B75A" },
  ambiguous: { light: "#B95A00", dark: "#E0913E" },
  error: { light: "#B10E1E", dark: "#E8726B" },
  skip: { light: "#605E6B", dark: "#C8C5D0" },
  running: { light: "#146C94", dark: "#4FA9C4" },
  info: { light: "#0F6CBD", dark: "#82B9FF" },
} as const;
