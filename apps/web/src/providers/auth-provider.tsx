'use client';

import { useEffect, createContext, useContext } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api';

interface User {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  tenantId: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, accessToken, isLoading, setUser, setToken, logout: storeLogout, setLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      if (!PUBLIC_PATHS.includes(pathname)) {
        router.push('/login');
      }
      return;
    }

    if (user) {
      setLoading(false);
      return;
    }

    // Загружаем профиль
    apiFetch<any>('/users/me')
      .then((data) => {
        setUser(data);
      })
      .catch(() => {
        storeLogout();
        if (!PUBLIC_PATHS.includes(pathname)) {
          router.push('/login');
        }
      });
  }, [accessToken, user, pathname]);

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Игнорируем ошибки при логауте
    }
    storeLogout();
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
