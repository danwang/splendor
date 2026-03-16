import type { Preview } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';

import '../src/styles.css';

const preview: Preview = {
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
};

export default preview;
