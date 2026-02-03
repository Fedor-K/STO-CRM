'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const navigation = [
  { name: 'Мои записи', href: '/my/appointments' },
  { name: 'Мои автомобили', href: '/my/vehicles' },
  { name: 'История ремонтов', href: '/my/orders' },
];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link href="/my/appointments" className="text-xl font-bold text-primary-600">
            STO-CRM
          </Link>

          <nav className="flex items-center gap-6">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'text-sm font-medium transition-colors',
                    isActive ? 'text-primary-600' : 'text-gray-600 hover:text-gray-900',
                  )}
                >
                  {item.name}
                </Link>
              );
            })}
            <button
              onClick={logout}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Выйти
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
