

import path from 'path';

/** @type { import('@storybook/nextjs-vite').StorybookConfig } */
const config = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest"
  ],
  "framework": {
    "name": "@storybook/nextjs-vite",
    "options": {}
  },
  "staticDirs": [
    "../public"
  ]
};

// Use a Vite alias so imports of 'airbnb-prop-types' resolve to the shim
// which exposes named ESM exports (forbidExtraProps etc.). This fixes the
// runtime error when the test/Storybook runner treats the CJS package as ESM.
config.viteFinal = async (viteConfig) => {
  viteConfig.resolve = viteConfig.resolve || {};
  // Ensure alias is an array of { find, replacement } entries so nested
  // resolutions and regex matches are handled consistently by Vite.
  const aliasEntry = { find: /^airbnb-prop-types(\/.*)?$/, replacement: path.resolve(__dirname, './airbnb-prop-types-shim.js') };
  if (Array.isArray(viteConfig.resolve.alias)) {
    // Remove any existing airbnb-prop-types aliases and prepend ours
    viteConfig.resolve.alias = [aliasEntry, ...viteConfig.resolve.alias.filter(a => !(a && (a.find === 'airbnb-prop-types' || String(a.find) === String(aliasEntry.find))))];
  } else if (viteConfig.resolve.alias && typeof viteConfig.resolve.alias === 'object') {
    // Convert object form to array form
    const existing = Object.entries(viteConfig.resolve.alias).map(([find, replacement]) => ({ find, replacement }));
    viteConfig.resolve.alias = [aliasEntry, ...existing.filter(a => a.find !== 'airbnb-prop-types')];
  } else {
    viteConfig.resolve.alias = [aliasEntry];
  }

  return viteConfig;
};
export default config;