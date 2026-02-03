import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Helper: create if not exists by unique-ish fields */
async function findOrCreate<T>(
  model: any,
  where: Record<string, any>,
  data: Record<string, any>,
): Promise<T> {
  const existing = await model.findFirst({ where });
  if (existing) return existing;
  return model.create({ data: { ...where, ...data } });
}

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

  // Виды ремонта (findOrCreate — нет unique constraint)
  const repairTypeData = [
    { name: 'Платный ремонт', isPaid: true, affectsRevenue: true },
    { name: 'Гарантийный ремонт', isPaid: false, affectsRevenue: false },
    { name: 'Внутренний ремонт', isPaid: false, affectsRevenue: false },
  ];
  for (const rt of repairTypeData) {
    await findOrCreate(prisma.repairType, { name: rt.name, tenantId: tenant.id }, rt);
  }
  console.log('  Виды ремонта: 3');

  // Рабочие посты
  const bayData = [
    { name: 'Пост №1 — Подъёмник', type: 'lift' },
    { name: 'Пост №2 — Подъёмник', type: 'lift' },
    { name: 'Пост №3 — Яма', type: 'pit' },
    { name: 'Диагностика', type: 'diagnostic' },
  ];
  for (const b of bayData) {
    await findOrCreate(prisma.serviceBay, { name: b.name, tenantId: tenant.id }, b);
  }
  console.log('  Рабочие посты: 4');

  // Каталог услуг
  const serviceData = [
    { name: 'Замена масла и фильтра', price: 2500, estimatedMinutes: 30, normHours: 0.5 },
    { name: 'Замена тормозных колодок (передние)', price: 3500, estimatedMinutes: 60, normHours: 1.0 },
    { name: 'Замена тормозных колодок (задние)', price: 3000, estimatedMinutes: 60, normHours: 1.0 },
    { name: 'Компьютерная диагностика', price: 2000, estimatedMinutes: 45, normHours: 0.75, serviceUsage: 'BOTH' as const },
    { name: 'Замена ремня ГРМ', price: 12000, estimatedMinutes: 240, normHours: 4.0, complexityLevel: 3 },
    { name: 'Развал-схождение', price: 4000, estimatedMinutes: 60, normHours: 1.0 },
    { name: 'Шиномонтаж (4 колеса)', price: 3000, estimatedMinutes: 40, normHours: 0.7 },
  ];
  for (const s of serviceData) {
    await findOrCreate(prisma.service, { name: s.name, tenantId: tenant.id }, s);
  }
  console.log(`  Услуги: ${serviceData.length}`);

  // Автомобили клиентов
  await findOrCreate(prisma.vehicle, { vin: 'JTDBE32K520123456', tenantId: tenant.id }, {
    make: 'Toyota',
    model: 'Camry',
    year: 2020,
    licensePlate: 'А777АА77',
    mileage: 45000,
    color: 'Белый',
    clientId: createdUsers['CLIENT'].id,
  });

  await findOrCreate(prisma.vehicle, { vin: 'WBAKJ210X0L123456', tenantId: tenant.id }, {
    make: 'BMW',
    model: 'X5',
    year: 2019,
    licensePlate: 'В888ВВ99',
    mileage: 62000,
    color: 'Чёрный',
    clientId: createdUsers['CLIENT2'].id,
  });

  console.log('  Автомобили: 2');

  // Каталог запчастей
  const partData = [
    { sku: 'OIL-5W30-4L', name: 'Масло моторное 5W-30, 4л', brand: 'Mobil', costPrice: 2800, sellPrice: 3500, currentStock: 15, minStock: 5, unit: 'шт' },
    { sku: 'FILT-OIL-TOY', name: 'Фильтр масляный Toyota', brand: 'Mann', oemNumber: '90915-YZZD4', costPrice: 450, sellPrice: 750, currentStock: 20, minStock: 5, unit: 'шт' },
    { sku: 'PAD-FRONT-TOY', name: 'Колодки тормозные передние Toyota Camry', brand: 'TRW', costPrice: 3200, sellPrice: 4800, currentStock: 8, minStock: 3, unit: 'комплект' },
    { sku: 'BELT-GRM-BMW', name: 'Ремень ГРМ BMW X5', brand: 'Continental', costPrice: 5500, sellPrice: 8200, currentStock: 3, minStock: 1, unit: 'шт' },
  ];
  for (const p of partData) {
    await findOrCreate(prisma.part, { sku: p.sku, tenantId: tenant.id }, p);
  }
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
