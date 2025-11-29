import React from 'react';
import { render } from '@testing-library/react';
import NavLink from '../NavLink';

const LinkComponent = (
  props: React.AnchorHTMLAttributes<HTMLAnchorElement>,
) => <a {...props} />;

jest.mock('next/link', () => ({
  __esModule: true,
  default: LinkComponent,
}));

describe('NavLink', () => {
  it('applies touch target size and active styles', () => {
    const { getByText, rerender } = render(<NavLink href="/foo">Foo</NavLink>);
    const link = getByText('Foo');
    expect(link.className).toContain('min-w-[44px]');
    expect(link.className).toContain('min-h-[44px]');
    expect(link.className).not.toContain('border-primary');
    rerender(
      <NavLink href="/foo" isActive>
        Foo
      </NavLink>,
    );
    expect(link.className).toContain('border-b-2');
  });
});
