import { flushPromises } from "@/test/utils/flush";
import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react';
import SendQuoteModal from '../SendQuoteModal';
import * as api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

