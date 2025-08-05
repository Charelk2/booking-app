// Re-export shared breakpoint constants so application code can import them
// using the `@/lib` alias while Tailwind consumes the original config.
export {
  BREAKPOINT_SM,
  BREAKPOINT_MD,
  BREAKPOINT_LG,
} from '../../breakpoints.config.js';
