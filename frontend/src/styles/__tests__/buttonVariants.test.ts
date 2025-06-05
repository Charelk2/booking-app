import { buttonVariants } from '../buttonVariants';

describe('buttonVariants', () => {
  it('provides classes for primary buttons', () => {
    expect(buttonVariants.primary).toMatch('bg-indigo-600');
  });

  it('provides classes for secondary buttons', () => {
    expect(buttonVariants.secondary).toMatch('bg-gray-200');
  });

  it('provides classes for danger buttons', () => {
    expect(buttonVariants.danger).toMatch('bg-red-600');
  });
});

