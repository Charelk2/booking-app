import { render, screen } from '@testing-library/react';
import Footer from '../Footer';

describe('Footer', () => {
  it('renders company section', () => {
    render(<Footer />);
    expect(screen.getByText('Company')).toBeTruthy();
  });
});
