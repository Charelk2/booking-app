import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import BookingSummaryCard from './BookingSummaryCard';

const meta = {
  component: BookingSummaryCard,
} satisfies Meta<typeof BookingSummaryCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};