import { render, screen } from '@testing-library/react';
import Footer from '../Footer';

describe('Footer', () => {
  it('renders company section', () => {
    render(<Footer />);
    expect(screen.getByText('Company')).toBeTruthy();
  });

  it('displays navigation links grid', () => {
    render(<Footer />);
    // Footer uses a grid for the right-hand links; ensure the grid container is present.
    const grids = screen.getAllByRole('list');
    expect(grids.length).toBeGreaterThan(0);
  });
});
