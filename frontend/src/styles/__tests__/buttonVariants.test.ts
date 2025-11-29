import { buttonVariants } from '../buttonVariants';

describe('buttonVariants', () => {
  it('provides classes for primary buttons', () => {
    expect(buttonVariants.primary.className).toBeDefined();
    expect(buttonVariants.primary.style.backgroundColor).toBeDefined();
  });

  it('provides classes for secondary buttons', () => {
    expect(buttonVariants.secondary.className).toBeDefined();
    expect(buttonVariants.secondary.style.border).toBeDefined();
  });

  it('provides classes for danger buttons', () => {
    expect(buttonVariants.danger.style.backgroundColor).toBeDefined();
  });

  it('provides classes for link buttons', () => {
    expect(buttonVariants.link.className).toContain('underline');
    expect(buttonVariants.link.style.backgroundColor).toBe('transparent');
  });
});
