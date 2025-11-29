export interface RouterLike {
  push: (url: string) => void;
}
import { SLIDER_MIN, SLIDER_MAX } from './filter-constants';
import { formatDateYMDLocal } from './shared/date';

interface Params {
  category?: string;
  location?: string;
  when?: Date | null;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
}

export function updateQueryParams(
  router: RouterLike,
  pathname: string,
  params: Params,
) {
  const search = new URLSearchParams();

  // Set category if it exists
  if (params.category) {
    search.set('category', params.category);
  }

  // Set location if it exists
  if (params.location) {
    search.set('location', params.location);
  }

  // Handle 'when' parameter: format to 'yyyy-MM-dd' if a Date object is provided,
  // otherwise ensure it's not set in the URL.
  if (params.when) {
    search.set('when', formatDateYMDLocal(params.when));
  } else {
    // If params.when is null or undefined, ensure the 'when' parameter is removed from the URL
    search.delete('when');
  }

  // Set sort if it exists
  if (params.sort) {
    search.set('sort', params.sort);
  }

  // Set minPrice if it's not null/undefined and greater than the slider minimum
  if (params.minPrice != null && params.minPrice > SLIDER_MIN) {
    search.set('minPrice', String(params.minPrice));
  } else {
    // If minPrice is at its default or not provided, remove it from the URL
    search.delete('minPrice');
  }

  // Set maxPrice if it's not null/undefined and less than the slider maximum
  if (params.maxPrice != null && params.maxPrice < SLIDER_MAX) {
    search.set('maxPrice', String(params.maxPrice));
  } else {
    // If maxPrice is at its default or not provided, remove it from the URL
    search.delete('maxPrice');
  }

  const qs = search.toString();

  // Push the new URL
  router.push(qs ? `${pathname}?${qs}` : pathname);
}
