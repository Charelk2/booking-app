import { redirect } from 'next/navigation';
import Page from '../page';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

describe('Login route server redirect', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /auth with next', () => {
    Page({ searchParams: { next: '/profile' } });
    expect(redirect).toHaveBeenCalledWith('/auth?intent=login&next=%2Fprofile');
  });
});
