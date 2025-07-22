'use client';

interface MarketingStripProps {
  text: string;
}

export default function MarketingStrip({ text }: MarketingStripProps) {
  return (
    <div className="bg-brand-light text-brand-dark text-center py-2 text-sm font-medium">
      {text}
    </div>
  );
}
