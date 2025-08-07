export const useRouter = jest.fn(() => ({
  push: jest.fn(),
  replace: jest.fn(),
  refresh: jest.fn(),
  pathname: '/',
}));

export const usePathname = jest.fn(() => '/');
export const useParams = jest.fn(() => ({}));
export const useSearchParams = jest.fn(() => new URLSearchParams());
