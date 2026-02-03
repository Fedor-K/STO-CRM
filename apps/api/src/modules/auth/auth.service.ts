import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tenantId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    tenantSlug: string;
  }): Promise<AuthTokens> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: data.tenantSlug },
    });

    if (!tenant) {
      throw new NotFoundException('Автосервис не найден');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email_tenantId: { email: data.email, tenantId: tenant.id } },
    });

    if (existing) {
      throw new ConflictException('Пользователь с таким email уже зарегистрирован');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: UserRole.CLIENT,
        tenantId: tenant.id,
      },
    });

    return this.generateTokens(user.id, user.email, user.role, tenant.id);
  }

  async login(data: {
    email: string;
    password: string;
    tenantSlug: string;
  }): Promise<AuthTokens> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: data.tenantSlug },
    });

    if (!tenant) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const user = await this.prisma.user.findUnique({
      where: { email_tenantId: { email: data.email, tenantId: tenant.id } },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    return this.generateTokens(user.id, user.email, user.role, tenant.id);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      throw new UnauthorizedException('Срок действия токена истёк');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    return this.generateTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role,
      stored.user.tenantId,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  async forgotPassword(data: { email: string; tenantSlug: string }): Promise<{ message: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: data.tenantSlug },
    });

    // Не раскрываем, существует ли email
    if (!tenant) {
      return { message: 'Если email зарегистрирован, вы получите письмо для сброса пароля' };
    }

    const user = await this.prisma.user.findUnique({
      where: { email_tenantId: { email: data.email, tenantId: tenant.id } },
    });

    if (!user) {
      return { message: 'Если email зарегистрирован, вы получите письмо для сброса пароля' };
    }

    // Генерируем токен сброса (используем JWT с коротким сроком)
    const resetToken = this.jwt.sign(
      { sub: user.id, type: 'password-reset' },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET') + user.passwordHash,
        expiresIn: '1h',
      },
    );

    // TODO: Отправка email через MessagingProvider
    // Пока логируем в консоль для разработки
    console.log(`[Password Reset] User: ${user.email}, Token: ${resetToken}`);

    return { message: 'Если email зарегистрирован, вы получите письмо для сброса пароля' };
  }

  async resetPassword(data: { token: string; password: string }): Promise<{ message: string }> {
    let payload: any;
    try {
      // Декодируем без проверки подписи, чтобы получить userId
      payload = this.jwt.decode(data.token) as any;
    } catch {
      throw new UnauthorizedException('Невалидный токен сброса пароля');
    }

    if (!payload?.sub || payload?.type !== 'password-reset') {
      throw new UnauthorizedException('Невалидный токен сброса пароля');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('Невалидный токен сброса пароля');
    }

    // Проверяем подпись с учётом текущего хеша пароля (одноразовость)
    try {
      this.jwt.verify(data.token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET') + user.passwordHash,
      });
    } catch {
      throw new UnauthorizedException('Токен сброса пароля истёк или уже использован');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Отзываем все refresh-токены
    await this.logoutAll(user.id);

    return { message: 'Пароль успешно изменён' };
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    tenantId: string,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
      tenantId,
    };

    const accessToken = this.jwt.sign(payload);

    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const refreshExpiresMs = this.parseDuration(refreshExpiresIn);

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: new Date(Date.now() + refreshExpiresMs),
      },
    });

    return { accessToken, refreshToken };
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
  }
}
