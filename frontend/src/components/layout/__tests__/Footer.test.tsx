import { render, screen } from '@testing-library/react';
import Footer from '../Footer';

describe('Footer', () => {
  it('renders company section', () => {
    render(<Footer />);
    expect(screen.getByText('Company')).toBeTruthy();
  });

  it('displays navigation links in a 3-column grid on large screens', () => {
    render(<Footer />);
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('md:grid-cols-3');
  });
});
