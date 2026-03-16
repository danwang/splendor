import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type StorybookConfig } from '@storybook/react-vite';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  viteFinal: async (baseConfig) => {
    baseConfig.resolve ??= {};
    baseConfig.resolve.alias = {
      ...(baseConfig.resolve.alias ?? {}),
      '@': join(currentDirectory, '../src'),
    };

    return baseConfig;
  },
};

export default config;
