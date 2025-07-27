import { buttonVariants } from '../buttonVariants';

describe('buttonVariants', () => {
  it('provides classes for primary buttons', () => {
    expect(buttonVariants.primary).toMatch('bg-brand');
  });

  it('provides classes for secondary buttons', () => {
    expect(buttonVariants.secondary).toMatch('border-brand');
  });

  it('provides classes for danger buttons', () => {
    expect(buttonVariants.danger).toMatch('bg-red-600');
  });

  it('provides classes for link buttons', () => {
    expect(buttonVariants.link).toMatch('text-brand-dark');
  });
});

