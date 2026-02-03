import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsEnum, IsBoolean, MinLength } from 'class-validator';
import { UsersService } from './users.service';
import { Roles, CurrentTenant, CurrentUser, type CurrentUserData } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { UserRole } from '@prisma/client';

class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Пользователи')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Текущий профиль' })
  getMe(@CurrentUser() user: CurrentUserData) {
    return this.usersService.findById(user.tenantId, user.id);
  }

  @Get()
  @Roles('users:read')
  @ApiOperation({ summary: 'Список пользователей' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  findAll(@CurrentTenant() tenantId: string, @Query() query: PaginationDto & { role?: UserRole }) {
    return this.usersService.findAll(tenantId, {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
      sort: query.sort ?? 'createdAt',
      order: query.order ?? 'desc',
      role: query.role,
    });
  }

  @Get(':id')
  @Roles('users:read')
  @ApiOperation({ summary: 'Детали пользователя' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.usersService.findById(tenantId, id);
  }

  @Post()
  @Roles('users:create')
  @ApiOperation({ summary: 'Создать пользователя' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateUserDto) {
    return this.usersService.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles('users:update')
  @ApiOperation({ summary: 'Обновить пользователя' })
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('users:delete')
  @ApiOperation({ summary: 'Удалить пользователя' })
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.usersService.delete(tenantId, id);
  }
}
