
jest.mock('next/navigation', () => {
  return {
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      pathname: '/',
    }),
    usePathname: () => '/',
  };
});

jest.mock('@/contexts/AuthContext', () => {
  const mock = jest.fn(() => ({
    user: null,
    token: null,
    loading: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
  }));
  return { useAuth: mock };
});
