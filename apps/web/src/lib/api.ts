const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface FetchOptions extends RequestInit {
  token?: string;
}

class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;

  const accessToken = token || (typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null);

  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    ...rest,
  });

  if (res.status === 401 && !path.includes('/auth/')) {
    // Попробуем обновить токен
    const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      localStorage.setItem('accessToken', data.accessToken);

      // Повторяем оригинальный запрос
      const retryRes = await fetch(`${API_URL}${path}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.accessToken}`,
          ...headers,
        },
        ...rest,
      });

      if (!retryRes.ok) {
        const error = await retryRes.json().catch(() => ({ message: 'Ошибка сервера' }));
        throw new ApiError(retryRes.status, error.message, error.details);
      }

      const retryText = await retryRes.text();
      return retryText ? JSON.parse(retryText) : null;
    }

    // Refresh не удался — разлогиниваем
    localStorage.removeItem('accessToken');
    window.location.href = '/login';
    throw new ApiError(401, 'Необходима авторизация');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Ошибка сервера' }));
    throw new ApiError(res.status, error.message, error.details);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export { ApiError };
