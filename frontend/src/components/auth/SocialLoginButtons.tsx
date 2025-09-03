'use client';

import Button from '@/components/ui/Button';

interface SocialLoginButtonsProps {
  redirectPath?: string;
}

const providers = [
  { id: 'google', name: 'Google', className: 'bg-red-500 hover:bg-red-600' },
  ...(process.env.NEXT_PUBLIC_APPLE_SIGNIN === '1'
    ? ([{ id: 'apple', name: 'Apple', className: 'bg-black hover:bg-gray-900' }] as const)
    : ([] as const)),
];

export default function SocialLoginButtons({ redirectPath = '/dashboard' }: SocialLoginButtonsProps) {
  const handleLogin = (provider: string) => {
    // Navigate via same-origin path so cookies are set for booka.co.za
    window.location.href = `/auth/${provider}/login?next=${encodeURIComponent(redirectPath)}`;
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
