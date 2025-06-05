'use client';

import Button from '@/components/ui/Button';

interface SocialLoginButtonsProps {
  redirectPath?: string;
}

const providers = [
  { id: 'google', name: 'Google', className: 'bg-red-500 hover:bg-red-600' },
  { id: 'github', name: 'GitHub', className: 'bg-gray-800 hover:bg-gray-900' },
];

export default function SocialLoginButtons({ redirectPath = '/dashboard' }: SocialLoginButtonsProps) {
  const handleLogin = (provider: string) => {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    window.location.href = `${base}/auth/${provider}/login?next=${encodeURIComponent(redirectPath)}`;
  };

  return (
    <div className="space-y-2">
      {providers.map((p) => (
        <Button
          key={p.id}
          type="button"
          onClick={() => handleLogin(p.id)}
          className={`w-full ${p.className}`}
        >
          Continue with {p.name}
        </Button>
      ))}
    </div>
  );
}
