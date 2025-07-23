export const SLIDER_MIN = 0;
export const SLIDER_MAX = 200000;
export const SLIDER_STEP = 100;

export const formatCurrency = (v: number) => `R${new Intl.NumberFormat().format(v)}`;
