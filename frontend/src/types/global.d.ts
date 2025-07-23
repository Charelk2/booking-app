declare namespace JSX {
  interface IntrinsicElements {
    "gmp-place-autocomplete": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        value?: string;
        placeholder?: string;
      },
      HTMLElement
    >;
  }
}