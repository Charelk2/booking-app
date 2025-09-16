// Shared types for Search components to avoid cross-import cycles
import type { Category as CategoryType } from '@/hooks/useServiceCategories';

export type Category = CategoryType;
export type SearchFieldId = 'category' | 'when' | 'location';
export type ActivePopup = SearchFieldId | null;

