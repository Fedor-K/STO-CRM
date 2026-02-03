import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Создание демо-данных...');

  // Тенант — OneMotors
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'onemotors' },
    update: {},
    create: {
      name: 'OneMotors',
      slug: 'onemotors',
      plan: 'professional',
      settings: {
        workingHours: { start: '09:00', end: '20:00' },
        workingDays: [1, 2, 3, 4, 5, 6],
        timezone: 'Europe/Moscow',
        currency: 'RUB',
      },
    },
  });

  console.log(`Тенант: ${tenant.name} (${tenant.id})`);

  const passwordHash = await bcrypt.hash('demo123', 10);

  // Пользователи
  const users = [
    {
      email: 'admin@onemotors.ru',
      role: UserRole.OWNER,
      firstName: 'Фёдор',
      lastName: 'Козлов',
      phone: '+79001234567',
    },
    {
      email: 'manager@onemotors.ru',
      role: UserRole.MANAGER,
      firstName: 'Алексей',
      lastName: 'Смирнов',
      phone: '+79001234568',
    },
    {
      email: 'reception@onemotors.ru',
      role: UserRole.RECEPTIONIST,
      firstName: 'Мария',
      lastName: 'Иванова',
      phone: '+79001234569',
    },
    {
      email: 'mechanic@onemotors.ru',
      role: UserRole.MECHANIC,
      firstName: 'Дмитрий',
      lastName: 'Петров',
      phone: '+79001234570',
    },
    {
      email: 'mechanic2@onemotors.ru',
      role: UserRole.MECHANIC,
      firstName: 'Сергей',
      lastName: 'Волков',
      phone: '+79001234571',
    },
    {
      email: 'client@onemotors.ru',
      role: UserRole.CLIENT,
      firstName: 'Иван',
      lastName: 'Кузнецов',
      phone: '+79001234572',
    },
    {
      email: 'client2@onemotors.ru',
      role: UserRole.CLIENT,
      firstName: 'Елена',
      lastName: 'Новикова',
      phone: '+79001234573',
    },
  ];

  const createdUsers: Record<string, any> = {};

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email_tenantId: { email: u.email, tenantId: tenant.id } },
      update: {},
      create: {
        ...u,
        passwordHash,
        tenantId: tenant.id,
      },
    });
    createdUsers[u.role + (u.email.includes('2') ? '2' : '')] = user;
    console.log(`  Пользователь: ${user.firstName} ${user.lastName} (${user.role})`);
  }

  // Суперадмин (вне тенанта — глобальный)
  const superadminTenant = await prisma.tenant.upsert({
    where: { slug: 'platform' },
    update: {},
    create: {
      name: 'Платформа',
      slug: 'platform',
      plan: 'platform',
    },
  });

  await prisma.user.upsert({
    where: { email_tenantId: { email: 'superadmin@stocrm.ru', tenantId: superadminTenant.id } },
    update: {},
    create: {
      email: 'superadmin@stocrm.ru',
      passwordHash,
      role: UserRole.SUPERADMIN,
      firstName: 'Админ',
      lastName: 'Платформы',
      tenantId: superadminTenant.id,
    },
  });
  console.log('  Суперадмин: superadmin@stocrm.ru');

  // Виды ремонта
  const repairTypes = await Promise.all([
    prisma.repairType.create({
      data: { name: 'Платный ремонт', isPaid: true, affectsRevenue: true, tenantId: tenant.id },
    }),
    prisma.repairType.create({
      data: { name: 'Гарантийный ремонт', isPaid: false, affectsRevenue: false, tenantId: tenant.id },
    }),
    prisma.repairType.create({
      data: { name: 'Внутренний ремонт', isPaid: false, affectsRevenue: false, tenantId: tenant.id },
    }),
  ]);
  console.log('  Виды ремонта: 3');

  // Рабочие посты
  const bays = await Promise.all([
    prisma.serviceBay.create({
      data: { name: 'Пост №1 — Подъёмник', type: 'lift', tenantId: tenant.id },
    }),
    prisma.serviceBay.create({
      data: { name: 'Пост №2 — Подъёмник', type: 'lift', tenantId: tenant.id },
    }),
    prisma.serviceBay.create({
      data: { name: 'Пост №3 — Яма', type: 'pit', tenantId: tenant.id },
    }),
    prisma.serviceBay.create({
      data: { name: 'Диагностика', type: 'diagnostic', tenantId: tenant.id },
    }),
  ]);
  console.log('  Рабочие посты: 4');

  // Каталог услуг
  const services = await Promise.all([
    prisma.service.create({
      data: {
        name: 'Замена масла и фильтра',
        price: 2500,
        estimatedMinutes: 30,
        normHours: 0.5,
        tenantId: tenant.id,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Замена тормозных колодок (передние)',
        price: 3500,
        estimatedMinutes: 60,
        normHours: 1.0,
        tenantId: tenant.id,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Замена тормозных колодок (задние)',
        price: 3000,
        estimatedMinutes: 60,
        normHours: 1.0,
        tenantId: tenant.id,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Компьютерная диагностика',
        price: 2000,
        estimatedMinutes: 45,
        normHours: 0.75,
        serviceUsage: 'BOTH',
        tenantId: tenant.id,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Замена ремня ГРМ',
        price: 12000,
        estimatedMinutes: 240,
        normHours: 4.0,
        complexityLevel: 3,
        tenantId: tenant.id,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Развал-схождение',
        price: 4000,
        estimatedMinutes: 60,
        normHours: 1.0,
        tenantId: tenant.id,
      },
    }),
    prisma.service.create({
      data: {
        name: 'Шиномонтаж (4 колеса)',
        price: 3000,
        estimatedMinutes: 40,
        normHours: 0.7,
        tenantId: tenant.id,
      },
    }),
  ]);
  console.log(`  Услуги: ${services.length}`);

  // Автомобили клиентов
  const vehicle1 = await prisma.vehicle.create({
    data: {
      make: 'Toyota',
      model: 'Camry',
      year: 2020,
      vin: 'JTDBE32K520123456',
      licensePlate: 'А777АА77',
      mileage: 45000,
      color: 'Белый',
      tenantId: tenant.id,
      clientId: createdUsers['CLIENT'].id,
    },
  });

  const vehicle2 = await prisma.vehicle.create({
    data: {
      make: 'BMW',
      model: 'X5',
      year: 2019,
      vin: 'WBAKJ210X0L123456',
      licensePlate: 'В888ВВ99',
      mileage: 62000,
      color: 'Чёрный',
      tenantId: tenant.id,
      clientId: createdUsers['CLIENT2'].id,
    },
  });

  console.log('  Автомобили: 2');

  // Каталог запчастей
  await Promise.all([
    prisma.part.create({
      data: {
        sku: 'OIL-5W30-4L',
        name: 'Масло моторное 5W-30, 4л',
        brand: 'Mobil',
        costPrice: 2800,
        sellPrice: 3500,
        currentStock: 15,
        minStock: 5,
        unit: 'шт',
        tenantId: tenant.id,
      },
    }),
    prisma.part.create({
      data: {
        sku: 'FILT-OIL-TOY',
        name: 'Фильтр масляный Toyota',
        brand: 'Mann',
        oemNumber: '90915-YZZD4',
        costPrice: 450,
        sellPrice: 750,
        currentStock: 20,
        minStock: 5,
        unit: 'шт',
        tenantId: tenant.id,
      },
    }),
    prisma.part.create({
      data: {
        sku: 'PAD-FRONT-TOY',
        name: 'Колодки тормозные передние Toyota Camry',
        brand: 'TRW',
        costPrice: 3200,
        sellPrice: 4800,
        currentStock: 8,
        minStock: 3,
        unit: 'комплект',
        tenantId: tenant.id,
      },
    }),
    prisma.part.create({
      data: {
        sku: 'BELT-GRM-BMW',
        name: 'Ремень ГРМ BMW X5',
        brand: 'Continental',
        costPrice: 5500,
        sellPrice: 8200,
        currentStock: 3,
        minStock: 1,
        unit: 'шт',
        tenantId: tenant.id,
      },
    }),
  ]);
  console.log('  Запчасти: 4');

  console.log('\nДемо-данные созданы!');
  console.log('\nУчётные записи (пароль для всех: demo123):');
  console.log('  superadmin@stocrm.ru  — Суперадмин платформы');
  console.log('  admin@onemotors.ru    — Владелец СТО');
  console.log('  manager@onemotors.ru  — Менеджер');
  console.log('  reception@onemotors.ru — Приёмщик');
  console.log('  mechanic@onemotors.ru — Механик');
  console.log('  client@onemotors.ru   — Клиент');
}

main()
  .catch((e) => {
    console.error('Ошибка при создании данных:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
