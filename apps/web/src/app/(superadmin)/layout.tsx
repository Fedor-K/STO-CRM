'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const navigation = [
  { name: 'Автосервисы', href: '/admin/tenants' },
  { name: 'Статистика', href: '/admin/stats' },
];

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-gray-900">
        <div className="flex h-16 items-center border-b border-gray-700 px-6">
          <Link href="/admin/tenants" className="text-xl font-bold text-white">
            STO-CRM
          </Link>
          <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-xs text-white">admin</span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                )}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-700 p-4">
          <button
            onClick={logout}
            className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Выйти
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
