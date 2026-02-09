import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { PrismaService } from '../../database/prisma.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { UsersService } from '../users/users.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { buildSystemPrompt, buildAdjustPrompt } from './ai-prompt';

interface ParsedAiResult {
  client: {
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
  vehicle: {
    make: string | null;
    model: string | null;
    year: number | null;
    licensePlate: string | null;
    vin: string | null;
  };
  clientComplaints: string;
  suggestedServices: { serviceId: string; name: string; price: number; normHours: number }[];
  suggestedParts: { partId: string; name: string; sellPrice: number; quantity: number }[];
  suggestedMechanicId: string | null;
}

@Injectable()
export class AiWorkOrderService {
  private readonly logger = new Logger(AiWorkOrderService.name);
  private readonly anthropic: Anthropic;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly appointmentsService: AppointmentsService,
    private readonly usersService: UsersService,
    private readonly vehiclesService: VehiclesService,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY не задан — AI-функции будут недоступны');
    }
    const proxyUrl = this.configService.get<string>('ANTHROPIC_PROXY_URL');
    const baseURL = this.configService.get<string>('ANTHROPIC_BASE_URL');
    const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey: apiKey || '' };
    if (baseURL) opts.baseURL = baseURL;
    if (proxyUrl) {
      const agent = new ProxyAgent(proxyUrl);
      opts.fetch = ((url: any, init: any) => undiciFetch(url, { ...init, dispatcher: agent })) as any;
    }
    this.anthropic = new Anthropic(opts);
  }

  async parse(tenantId: string, description: string) {
    if (!this.configService.get<string>('ANTHROPIC_API_KEY')) {
      throw new BadRequestException('AI-функция не настроена: ANTHROPIC_API_KEY не задан');
    }

    // 1. Extract keywords from description for smart catalog filtering
    const stopWords = new Set([
      'это', 'что', 'как', 'для', 'при', 'его', 'она', 'они', 'был', 'была', 'будет',
      'нужно', 'нужна', 'просит', 'говорит', 'также', 'приехал', 'приехала', 'госномер',
      'номер', 'год', 'года', 'замена', 'замену', 'заменить', 'поменять', 'менять',
      'ремонт', 'сделать', 'проверить', 'нужен', 'нужна', 'нужны', 'очень', 'еще',
      'который', 'которая', 'которые', 'автомобиль', 'машина', 'машину', 'авто',
    ]);
    const keywords = description
      .toLowerCase()
      .replace(/[^а-яёa-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .filter((w) => !stopWords.has(w));
    const uniqueKeywords = [...new Set(keywords)];

    // 2. Load catalogs in parallel — services & parts filtered by keywords
    const serviceKeywordFilter = uniqueKeywords.length > 0
      ? { OR: uniqueKeywords.map((kw) => ({ name: { contains: kw, mode: 'insensitive' as const } })) }
      : {};
    const partKeywordFilter = uniqueKeywords.length > 0
      ? { OR: uniqueKeywords.map((kw) => ({ name: { contains: kw, mode: 'insensitive' as const } })) }
      : {};

    const [relevantServices, topServices, relevantParts, topParts, mechanicsRaw] = await Promise.all([
      // Services matching description keywords
      this.prisma.service.findMany({
        where: { tenantId, isActive: true, ...serviceKeywordFilter },
        select: { id: true, name: true, price: true, normHours: true },
        orderBy: { name: 'asc' },
        take: 150,
      }),
      // Top common services as fallback (диагностика, ТО)
      this.prisma.service.findMany({
        where: { tenantId, isActive: true, OR: [
          { name: { contains: 'диагностик', mode: 'insensitive' } },
          { name: { contains: 'ТО ', mode: 'insensitive' } },
        ]},
        select: { id: true, name: true, price: true, normHours: true },
        orderBy: { name: 'asc' },
        take: 30,
      }),
      // Parts matching description keywords
      this.prisma.part.findMany({
        where: { tenantId, ...partKeywordFilter },
        select: { id: true, name: true, brand: true, sellPrice: true, currentStock: true },
        orderBy: { currentStock: 'desc' },
        take: 200,
      }),
      // Top in-stock parts as fallback
      this.prisma.part.findMany({
        where: { tenantId, currentStock: { gt: 0 } },
        select: { id: true, name: true, brand: true, sellPrice: true, currentStock: true },
        orderBy: { currentStock: 'desc' },
        take: 50,
      }),
      this.prisma.user.findMany({
        where: { tenantId, role: 'MECHANIC', isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          _count: { select: { workOrdersAsMechanic: { where: { status: { in: ['NEW', 'DIAGNOSED', 'APPROVED', 'IN_PROGRESS', 'PAUSED'] } } } } },
        },
      }),
    ]);

    // Merge and deduplicate
    const serviceMap = new Map<string, typeof relevantServices[0]>();
    for (const s of [...relevantServices, ...topServices]) serviceMap.set(s.id, s);
    const services = [...serviceMap.values()].slice(0, 250);

    const partMap = new Map<string, typeof relevantParts[0]>();
    for (const p of [...relevantParts, ...topParts]) partMap.set(p.id, p);
    const parts = [...partMap.values()].slice(0, 250);

    const mechanics = mechanicsRaw.map((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      activeOrdersCount: (m as any)._count.workOrdersAsMechanic,
    }));

    // 2. Build system prompt with catalogs
    const systemPrompt = buildSystemPrompt(
      services.map((s) => ({ ...s, price: Number(s.price), normHours: s.normHours ? Number(s.normHours) : null })),
      parts.map((p) => ({ ...p, sellPrice: Number(p.sellPrice) })),
      mechanics,
    );

    // 3. Call Claude
    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: description }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new BadRequestException('AI не вернул текстовый ответ');
    }

    let parsed: ParsedAiResult;
    try {
      // Strip markdown code fences if present (```json ... ```)
      let jsonText = textBlock.text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      parsed = JSON.parse(jsonText);
    } catch {
      this.logger.error(`AI вернул невалидный JSON: ${textBlock.text}`);
      throw new BadRequestException('AI вернул невалидный ответ, попробуйте ещё раз');
    }

    // 4. Search for existing vehicle/client in DB
    let existingVehicle: any = null;
    let existingClient: any = null;

    if (parsed.vehicle?.licensePlate) {
      // Search by both Latin and Cyrillic variants of the plate
      const plate = parsed.vehicle.licensePlate.toUpperCase();
      const LAT_TO_CYR: Record<string, string> = { A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х' };
      const CYR_TO_LAT: Record<string, string> = Object.fromEntries(Object.entries(LAT_TO_CYR).map(([l, c]) => [c, l]));
      const cyrPlate = plate.replace(/[A-Z]/g, (ch) => LAT_TO_CYR[ch] || ch);
      const latPlate = plate.replace(/[А-Я]/g, (ch) => CYR_TO_LAT[ch] || ch);
      const plateVariants = [...new Set([plate, cyrPlate, latPlate])];

      existingVehicle = await this.prisma.vehicle.findFirst({
        where: { tenantId, licensePlate: { in: plateVariants } },
        include: { client: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      });
    }
    if (!existingVehicle && parsed.vehicle?.vin) {
      existingVehicle = await this.prisma.vehicle.findFirst({
        where: { tenantId, vin: parsed.vehicle.vin },
        include: { client: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      });
    }

    if (existingVehicle?.client) {
      existingClient = existingVehicle.client;
    } else if (parsed.client?.phone) {
      existingClient = await this.prisma.user.findFirst({
        where: { tenantId, phone: parsed.client.phone },
        select: { id: true, firstName: true, lastName: true, phone: true },
      });
    }
    // Fallback: search by name if still not found
    // AI may swap firstName/lastName, so try both orientations
    let candidateClients: { id: string; firstName: string; lastName: string; phone: string | null; middleName?: string | null; vehicles: { id: string; make: string; model: string; year: number | null; licensePlate: string | null; vin: string | null }[] }[] = [];
    if (!existingClient && (parsed.client?.lastName || parsed.client?.firstName)) {
      const ln = parsed.client.lastName?.trim();
      const fn = parsed.client.firstName?.trim();

      const nameOrConditions = (ln && fn)
        ? [
            { lastName: { contains: ln, mode: 'insensitive' as const }, firstName: { contains: fn, mode: 'insensitive' as const } },
            { lastName: { contains: fn, mode: 'insensitive' as const }, firstName: { contains: ln, mode: 'insensitive' as const } },
          ]
        : [
            { lastName: { contains: (ln || fn)!, mode: 'insensitive' as const } },
            { firstName: { contains: (ln || fn)!, mode: 'insensitive' as const } },
          ];

      const candidates = await this.prisma.user.findMany({
        where: { tenantId, role: 'CLIENT', OR: nameOrConditions },
        select: {
          id: true, firstName: true, lastName: true, middleName: true, phone: true,
          vehicles: { select: { id: true, make: true, model: true, year: true, licensePlate: true, vin: true }, orderBy: { updatedAt: 'desc' } },
        },
        take: 10,
      });

      if (candidates.length === 1) {
        existingClient = candidates[0];
      } else if (candidates.length > 1) {
        // Try narrowing by phone first
        if (parsed.client?.phone) {
          const byPhone = candidates.find((c) => c.phone === parsed.client!.phone);
          if (byPhone) {
            existingClient = byPhone;
          }
        }
        // If still ambiguous, pick the first but return all candidates for user to choose
        if (!existingClient) {
          existingClient = candidates[0];
          candidateClients = candidates;
        }
      }
    }

    // If we found client by name but no vehicle yet, try to find their latest vehicle
    if (existingClient && !existingVehicle) {
      existingVehicle = await this.prisma.vehicle.findFirst({
        where: { tenantId, clientId: existingClient.id },
        orderBy: { updatedAt: 'desc' },
      });
    }

    // 5. Pick mechanic with least load
    const sortedMechanics = [...mechanics].sort((a, b) => a.activeOrdersCount - b.activeOrdersCount);
    const suggestedMechanic = parsed.suggestedMechanicId
      ? mechanics.find((m) => m.id === parsed.suggestedMechanicId) || sortedMechanics[0]
      : sortedMechanics[0];

    // 6. Validate serviceIds and partIds from AI response
    const serviceIds = new Set(services.map((s) => s.id));
    const partIds = new Set(parts.map((p) => p.id));

    const validServices = (parsed.suggestedServices || []).filter((s) => serviceIds.has(s.serviceId));
    const validParts = (parsed.suggestedParts || []).filter((p) => partIds.has(p.partId));

    return {
      client: {
        existingId: existingClient?.id || null,
        firstName: existingClient?.firstName || parsed.client?.firstName || null,
        lastName: existingClient?.lastName || parsed.client?.lastName || null,
        phone: existingClient?.phone || parsed.client?.phone || null,
        isNew: !existingClient,
      },
      candidateClients: candidateClients.length > 1 ? candidateClients.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        middleName: c.middleName || null,
        phone: c.phone,
        vehicles: c.vehicles.map((v) => ({
          id: v.id, make: v.make, model: v.model, year: v.year, licensePlate: v.licensePlate, vin: v.vin,
        })),
      })) : [],
      vehicle: {
        existingId: existingVehicle?.id || null,
        make: existingVehicle?.make || parsed.vehicle?.make || null,
        model: existingVehicle?.model || parsed.vehicle?.model || null,
        year: existingVehicle?.year || parsed.vehicle?.year || null,
        licensePlate: existingVehicle?.licensePlate || parsed.vehicle?.licensePlate || null,
        vin: existingVehicle?.vin || parsed.vehicle?.vin || null,
        isNew: !existingVehicle,
      },
      clientComplaints: parsed.clientComplaints || description,
      suggestedServices: validServices.map((s) => {
        const svc = services.find((sv) => sv.id === s.serviceId);
        return {
          serviceId: s.serviceId,
          name: svc?.name || s.name,
          price: Number(svc?.price ?? s.price),
          normHours: svc?.normHours ? Number(svc.normHours) : s.normHours,
        };
      }),
      suggestedParts: validParts.map((p) => {
        const part = parts.find((pt) => pt.id === p.partId);
        return {
          partId: p.partId,
          name: part?.name || p.name,
          sellPrice: Number(part?.sellPrice ?? p.sellPrice),
          quantity: p.quantity || 1,
          inStock: (part?.currentStock ?? 0) >= (p.quantity || 1),
        };
      }),
      suggestedMechanic: suggestedMechanic
        ? {
            mechanicId: suggestedMechanic.id,
            firstName: suggestedMechanic.firstName,
            lastName: suggestedMechanic.lastName,
            activeOrdersCount: suggestedMechanic.activeOrdersCount,
          }
        : null,
    };
  }

  async create(
    tenantId: string,
    data: {
      existingClientId?: string;
      newClient?: { firstName: string; lastName: string; phone?: string };
      existingVehicleId?: string;
      newVehicle?: { make: string; model: string; year?: number; licensePlate?: string; vin?: string };
      clientComplaints: string;
      services: { serviceId: string; name: string; price: number; normHours?: number }[];
      parts: { partId: string; name: string; sellPrice: number; quantity: number }[];
      mechanicId?: string;
    },
    userId: string,
  ) {
    let clientId = data.existingClientId;

    // 1. Create client if needed
    if (!clientId && data.newClient) {
      const phone = data.newClient.phone || undefined;
      const randomSuffix = Math.random().toString(36).slice(2, 14);
      const email = phone ? `${phone}@client.local` : `client-${randomSuffix}@client.local`;
      const password = Math.random().toString(36).slice(2, 14);

      const client = await this.usersService.create(tenantId, {
        email,
        password,
        role: 'CLIENT' as any,
        firstName: data.newClient.firstName,
        lastName: data.newClient.lastName,
        phone,
      });
      clientId = client.id;
    }

    if (!clientId) {
      throw new BadRequestException('Не указан клиент');
    }

    // 2. Create vehicle if needed
    let vehicleId = data.existingVehicleId;
    if (!vehicleId && data.newVehicle) {
      const vehicle = await this.vehiclesService.create(tenantId, {
        make: data.newVehicle.make,
        model: data.newVehicle.model,
        year: data.newVehicle.year,
        licensePlate: data.newVehicle.licensePlate,
        vin: data.newVehicle.vin,
        clientId,
      });
      vehicleId = vehicle.id;
    }

    if (!vehicleId) {
      throw new BadRequestException('Не указан автомобиль');
    }

    // 3. Build plannedItems for appointment
    const plannedItems: any[] = [];
    for (const svc of data.services) {
      plannedItems.push({
        type: 'LABOR',
        description: svc.name,
        quantity: 1,
        unitPrice: svc.price,
        normHours: svc.normHours,
        serviceId: svc.serviceId,
      });
    }
    for (const part of data.parts) {
      plannedItems.push({
        type: 'PART',
        description: part.name,
        quantity: part.quantity,
        unitPrice: part.sellPrice,
        partId: part.partId,
      });
    }

    // 4. Create appointment with advisor = current user
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const appointment = await this.appointmentsService.create(tenantId, {
      clientId,
      vehicleId,
      advisorId: userId,
      scheduledStart: now.toISOString(),
      scheduledEnd: oneHourLater.toISOString(),
      notes: data.clientComplaints,
      source: 'ai',
    });

    // 5. Update with plannedItems
    if (plannedItems.length > 0) {
      await this.appointmentsService.update(tenantId, appointment.id, { plannedItems });
    }

    // 6. Advance to "Согласование" — ждём подтверждения клиента
    await this.appointmentsService.updateStatus(tenantId, appointment.id, 'ESTIMATING' as any);

    // Return appointment with full data for frontend
    return this.appointmentsService.findById(tenantId, appointment.id);
  }

  async adjust(
    tenantId: string,
    data: {
      vehicle: { make: string; model: string; year?: number };
      complaint: string;
      currentServices: { serviceId: string; name: string }[];
      currentParts: { partId: string; name: string }[];
    },
  ) {
    if (!this.configService.get<string>('ANTHROPIC_API_KEY')) {
      throw new BadRequestException('AI-функция не настроена');
    }

    // Load catalogs (filtered by complaint keywords)
    const keywords = data.complaint
      .toLowerCase()
      .replace(/[^а-яёa-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    const uniqueKeywords = [...new Set(keywords)];

    const keywordFilter = uniqueKeywords.length > 0
      ? { OR: uniqueKeywords.map((kw) => ({ name: { contains: kw, mode: 'insensitive' as const } })) }
      : {};

    const [services, topServices, parts, topParts] = await Promise.all([
      this.prisma.service.findMany({
        where: { tenantId, isActive: true, ...keywordFilter },
        select: { id: true, name: true, price: true, normHours: true },
        take: 150,
      }),
      this.prisma.service.findMany({
        where: { tenantId, isActive: true, OR: [
          { name: { contains: 'диагностик', mode: 'insensitive' } },
          { name: { contains: 'КПП', mode: 'insensitive' } },
          { name: { contains: 'АКПП', mode: 'insensitive' } },
          { name: { contains: 'сцепление', mode: 'insensitive' } },
        ]},
        select: { id: true, name: true, price: true, normHours: true },
        take: 50,
      }),
      this.prisma.part.findMany({
        where: { tenantId, ...keywordFilter },
        select: { id: true, name: true, brand: true, sellPrice: true, currentStock: true },
        take: 200,
      }),
      this.prisma.part.findMany({
        where: { tenantId, currentStock: { gt: 0 } },
        select: { id: true, name: true, brand: true, sellPrice: true, currentStock: true },
        orderBy: { currentStock: 'desc' },
        take: 50,
      }),
    ]);

    const svcMap = new Map<string, typeof services[0]>();
    for (const s of [...services, ...topServices]) svcMap.set(s.id, s);
    const allServices = [...svcMap.values()];

    const partMap = new Map<string, typeof parts[0]>();
    for (const p of [...parts, ...topParts]) partMap.set(p.id, p);
    const allParts = [...partMap.values()];

    const prompt = buildAdjustPrompt(
      { make: data.vehicle.make, model: data.vehicle.model, year: data.vehicle.year || null },
      data.complaint,
      data.currentServices,
      data.currentParts,
      allServices.map((s) => ({ ...s, price: Number(s.price), normHours: s.normHours ? Number(s.normHours) : null })),
      allParts.map((p) => ({ ...p, sellPrice: Number(p.sellPrice) })),
    );

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: prompt,
      messages: [{ role: 'user', content: `Автомобиль: ${data.vehicle.make} ${data.vehicle.model}. Жалоба: ${data.complaint}. Скорректируй.` }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new BadRequestException('AI не вернул ответ');
    }

    let parsed: any;
    try {
      let jsonText = textBlock.text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      parsed = JSON.parse(jsonText);
    } catch {
      this.logger.error(`AI adjust вернул невалидный JSON: ${textBlock.text}`);
      throw new BadRequestException('AI вернул невалидный ответ');
    }

    // Validate IDs
    const serviceIds = new Set(allServices.map((s) => s.id));
    const partIds = new Set(allParts.map((p) => p.id));

    const validServices = (parsed.suggestedServices || []).filter((s: any) => serviceIds.has(s.serviceId));
    const validParts = (parsed.suggestedParts || []).filter((p: any) => partIds.has(p.partId));

    return {
      suggestedServices: validServices.map((s: any) => {
        const svc = allServices.find((sv) => sv.id === s.serviceId);
        return { serviceId: s.serviceId, name: svc?.name || s.name, price: Number(svc?.price ?? s.price), normHours: svc?.normHours ? Number(svc.normHours) : s.normHours };
      }),
      suggestedParts: validParts.map((p: any) => {
        const part = allParts.find((pt) => pt.id === p.partId);
        return { partId: p.partId, name: part?.name || p.name, sellPrice: Number(part?.sellPrice ?? p.sellPrice), quantity: p.quantity || 1, inStock: (part?.currentStock ?? 0) >= (p.quantity || 1) };
      }),
      explanation: parsed.explanation || '',
    };
  }
}
