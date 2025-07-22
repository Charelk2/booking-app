import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ArtistsSection from '../ArtistsSection';
import * as api from '@/lib/api';
import type { ArtistProfile } from '@/types';

jest.mock('@/lib/api');

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

