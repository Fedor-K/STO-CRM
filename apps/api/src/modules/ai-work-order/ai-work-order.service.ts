import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { PrismaService } from '../../database/prisma.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { UsersService } from '../users/users.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { buildSystemPrompt } from './ai-prompt';

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

    // 1. Load catalogs in parallel
    const [services, parts, mechanicsRaw] = await Promise.all([
      this.prisma.service.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, price: true, normHours: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.part.findMany({
        where: { tenantId, currentStock: { gt: 0 } },
        select: { id: true, name: true, brand: true, sellPrice: true, currentStock: true },
        orderBy: { currentStock: 'desc' },
        take: 300,
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

    // 3. Create work order
    const workOrder = await this.workOrdersService.create(
      tenantId,
      {
        clientId,
        vehicleId,
        mechanicId: data.mechanicId,
        clientComplaints: data.clientComplaints,
      },
      userId,
    );

    // 4. Add items
    for (const svc of data.services) {
      await this.workOrdersService.addItem(
        tenantId,
        workOrder.id,
        {
          type: 'LABOR',
          description: svc.name,
          quantity: 1,
          unitPrice: svc.price,
          normHours: svc.normHours,
          serviceId: svc.serviceId,
        },
        userId,
      );
    }

    for (const part of data.parts) {
      await this.workOrdersService.addItem(
        tenantId,
        workOrder.id,
        {
          type: 'PART',
          description: part.name,
          quantity: part.quantity,
          unitPrice: part.sellPrice,
          partId: part.partId,
        },
        userId,
      );
    }

    // 5. Return full work order
    return this.workOrdersService.findById(tenantId, workOrder.id);
  }
}
