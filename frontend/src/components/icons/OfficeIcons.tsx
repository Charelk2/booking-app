'use client';

import React from 'react';

type Props = React.SVGProps<SVGSVGElement> & { size?: number };

const DocBase: React.FC<Props & { color: string; label?: string }> = ({ color, label, size = 16, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...rest}
  >
    <rect x="4" y="3" width="16" height="18" rx="2.5" ry="2.5" fill="#fff" stroke="#E5E7EB" />
    <rect x="4" y="3" width="16" height="6" rx="2.5" ry="2.5" fill={color} />
    {label ? (
      <text x="12" y="7.5" textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight={700} fill="#fff">{label}</text>
    ) : null}
  </svg>
);

export const WordIcon: React.FC<Props> = ({ size = 16, ...rest }) => (
  <DocBase color="#185ABD" label="W" size={size} {...rest} />
);

export const ExcelIcon: React.FC<Props> = ({ size = 16, ...rest }) => (
  <DocBase color="#217346" label="X" size={size} {...rest} />
);

export const PowerPointIcon: React.FC<Props> = ({ size = 16, ...rest }) => (
  <DocBase color="#D24726" label="P" size={size} {...rest} />
);

export const PdfIcon: React.FC<Props> = ({ size = 16, ...rest }) => (
  <DocBase color="#D32F2F" label="PDF" size={size} {...rest} />
);

