export interface RouterLike {
  push: (url: string) => void;
}
import { SLIDER_MIN, SLIDER_MAX } from './filter-constants';

interface Params {
  category?: string;
  location?: string;
  when?: Date | null;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  verifiedOnly?: boolean;
}

export function updateQueryParams(
  router: RouterLike,
  pathname: string,
  params: Params,
) {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.location) search.set('location', params.location);
  if (params.when) search.set('when', params.when.toISOString());
  if (params.sort) search.set('sort', params.sort);
  if (params.minPrice != null && params.minPrice > SLIDER_MIN) search.set('minPrice', String(params.minPrice));
  if (params.maxPrice != null && params.maxPrice < SLIDER_MAX) search.set('maxPrice', String(params.maxPrice));
  if (params.verifiedOnly) search.set('verifiedOnly', 'true');
  const qs = search.toString();
  router.push(qs ? `${pathname}?${qs}` : pathname);
}
