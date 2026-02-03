import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

export const TENANT_ID_KEY = 'tenantId';

/**
 * Interceptor для извлечения tenantId из JWT и сохранения в request.
 * Используется совместно с Prisma client extension для автофильтрации.
 */
@Injectable()
export class TenantScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.tenantId) {
      request[TENANT_ID_KEY] = user.tenantId;
    }

    return next.handle();
  }
}
