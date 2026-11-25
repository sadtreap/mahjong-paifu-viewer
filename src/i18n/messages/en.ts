/**
 * Source of truth for UI strings. Other locales must provide the same shape (`Messages`).
 * Use functions for strings that need interpolation, e.g. `round: (n: number) => \`Round ${n}\``.
 */
export const en = {
  app: {
    title: "Mahjong Paifu Viewer",
    tagline: "View Tenhou and mjai game logs in your browser.",
  },
  settings: {
    language: "Language",
  },
};

export type Messages = typeof en;
