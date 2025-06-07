import { buttonVariants } from '../buttonVariants';

describe('buttonVariants', () => {
  it('provides classes for primary buttons', () => {
    expect(buttonVariants.primary).toMatch('bg-brand');
  });

  it('provides classes for secondary buttons', () => {
    expect(buttonVariants.secondary).toMatch('bg-brand-light');
  });

  it('provides classes for danger buttons', () => {
    expect(buttonVariants.danger).toMatch('bg-red-600');
  });
});

