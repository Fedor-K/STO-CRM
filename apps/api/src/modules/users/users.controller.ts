import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Roles, CurrentTenant, CurrentUser, type CurrentUserData } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { UserRole } from '@prisma/client';

class CreateUserDto {
  email!: string;
  password!: string;
  role!: UserRole;
  firstName!: string;
  lastName!: string;
  phone?: string;
}

class UpdateUserDto {
  email?: string;
  role?: UserRole;
  firstName?: string;
  lastName?: string;
  phone?: string;
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
  findAll(@CurrentTenant() tenantId: string, @Query() query: PaginationDto) {
    return this.usersService.findAll(tenantId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sort: query.sort ?? 'createdAt',
      order: query.order ?? 'desc',
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
