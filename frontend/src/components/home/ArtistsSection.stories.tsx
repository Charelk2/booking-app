import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import ArtistsSection from './ArtistsSection';

const meta = {
  component: ArtistsSection,
} satisfies Meta<typeof ArtistsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};