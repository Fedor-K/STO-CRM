import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface SpravochnikRecommendation {
  services: {
    serviceDescription: string;
    serviceId: string | null;
    serviceName: string | null;
    servicePrice: number | null;
    parts: {
      partId: string | null;
      partName: string;
      partSku: string | null;
      partBrand: string | null;
      avgPrice: number;
      usageCount: number;
      currentStock: number;
      currentPrice: number;
      isActive: boolean;
    }[];
  }[];
}

// Russian keywords mapped to search patterns (including morphological variants)
const KEYWORD_MAP: Record<string, string[]> = {
  'тормоз': ['тормоз', 'колод', 'диск тормоз'],
  'масло': ['масло', 'масл', 'фильтр масл'],
  'подвеск': ['подвеск', 'амортизатор', 'стойк', 'сайлентблок', 'рычаг'],
  'двигатель': ['двигател', 'мотор', 'двс'],
  'мотор': ['двигател', 'мотор', 'двс'],
  'кондиционер': ['кондиционер', 'климат', 'фреон'],
  'свеч': ['свеч', 'зажиган'],
  'ремень': ['ремень', 'ремн', 'ролик'],
  'фильтр': ['фильтр'],
  'диагностик': ['диагностик'],
  'сцеплен': ['сцеплен', 'выжимн'],
  'кпп': ['кпп', 'коробк', 'передач'],
  'акпп': ['акпп', 'автомат'],
  'развал': ['развал', 'сход'],
  'шин': ['шин', 'колес', 'балансир'],
  'аккумулятор': ['аккумулятор', 'акб', 'батаре'],
  'генератор': ['генератор'],
  'стартер': ['стартер'],
  'охлажден': ['охлажден', 'антифриз', 'радиатор', 'термостат'],
  'выхлоп': ['выхлоп', 'глушител', 'катализатор'],
  'рулев': ['рулев', 'гур', 'насос гур', 'рейк'],
  'электр': ['электр', 'провод', 'датчик'],
  'кузов': ['кузов', 'покраск', 'рихтовк'],
  'турбин': ['турбин', 'турбо'],
  'инжектор': ['инжектор', 'форсунк'],
  'топлив': ['топлив', 'бензонасос', 'фильтр топлив'],
};

@Injectable()
export class SpravochnikService implements OnModuleInit {
  private readonly logger = new Logger(SpravochnikService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Refresh all tenants asynchronously on startup (= each deploy)
    this.refreshAllTenants().catch((err) => {
      this.logger.error(`Ошибка обновления справочника при старте: ${err.message}`);
    });
  }

  private async refreshAllTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    for (const tenant of tenants) {
      try {
        await this.refreshTenant(tenant.id);
        this.logger.log(`Справочник обновлён для тенанта "${tenant.name}"`);
      } catch (err: any) {
        this.logger.error(`Ошибка обновления справочника для "${tenant.name}": ${err.message}`);
      }
    }
  }

  /**
   * Rebuild the vehicle_part_stats table for a specific tenant
   * from historical work order data.
   */
  async refreshTenant(tenantId: string): Promise<{ rowsInserted: number }> {
    // 1. Clear existing data for this tenant
    await this.prisma.$executeRaw`
      DELETE FROM vehicle_part_stats WHERE "tenantId" = ${tenantId}
    `;

    // 2. Aggregate from work_order_items with per-service relevance
    //    relevance = WOs with this service+part / WOs with this service (not all WOs)
    const result = await this.prisma.$executeRaw`
      WITH svc_counts AS (
        SELECT
          wo."tenantId",
          UPPER(v.make) AS make,
          UPPER(v.model) AS model,
          labor.description AS svc_desc,
          COUNT(DISTINCT wo.id)::int AS cnt
        FROM work_order_items labor
        JOIN work_orders wo ON labor."workOrderId" = wo.id
        JOIN vehicles v ON wo."vehicleId" = v.id
        WHERE labor.type = 'LABOR'
          AND wo."tenantId" = ${tenantId}
        GROUP BY wo."tenantId", UPPER(v.make), UPPER(v.model), labor.description
      )
      INSERT INTO vehicle_part_stats (
        "tenantId", make, model, "serviceDescription",
        "partId", "partName", "partSku", "partBrand",
        "avgPrice", "usageCount", "woCount", "relevance"
      )
      SELECT
        wo."tenantId",
        UPPER(v.make),
        UPPER(v.model),
        labor.description,
        part."partId",
        part.description,
        p.sku,
        p.brand,
        ROUND(AVG(part."unitPrice")::numeric, 2),
        COUNT(*)::int,
        COUNT(DISTINCT wo.id)::int,
        ROUND(
          COUNT(DISTINCT wo.id)::numeric * 100.0
          / NULLIF(sc.cnt, 0),
          2
        )
      FROM work_order_items labor
      JOIN work_orders wo ON labor."workOrderId" = wo.id
      JOIN vehicles v ON wo."vehicleId" = v.id
      JOIN work_order_items part
        ON labor."workOrderId" = part."workOrderId"
        AND part.type = 'PART'
      LEFT JOIN parts p ON part."partId" = p.id
      JOIN svc_counts sc
        ON sc."tenantId" = wo."tenantId"
        AND sc.make = UPPER(v.make)
        AND sc.model = UPPER(v.model)
        AND sc.svc_desc = labor.description
      WHERE labor.type = 'LABOR'
        AND wo."tenantId" = ${tenantId}
      GROUP BY
        wo."tenantId", UPPER(v.make), UPPER(v.model),
        labor.description, part."partId", part.description,
        p.sku, p.brand, sc.cnt
      HAVING COUNT(*) >= 2
        AND sc.cnt >= 3
        AND ROUND(
          COUNT(DISTINCT wo.id)::numeric * 100.0
          / NULLIF(sc.cnt, 0),
          2
        ) >= CASE
          WHEN sc.cnt >= 10 THEN 35
          ELSE 55
        END
    `;

    this.logger.log(`Справочник тенанта ${tenantId}: вставлено ${result} строк`);
    return { rowsInserted: result };
  }

  /**
   * Extract matching keywords from a complaint text.
   */
  private extractKeywords(complaint: string): string[] {
    const lower = complaint.toLowerCase();
    const patterns: string[] = [];

    for (const [keyword, synonyms] of Object.entries(KEYWORD_MAP)) {
      if (synonyms.some((syn) => lower.includes(syn)) || lower.includes(keyword)) {
        for (const syn of synonyms) {
          patterns.push(`%${syn}%`);
        }
      }
    }

    // If no keywords matched, try splitting into words ≥ 4 chars
    if (patterns.length === 0) {
      const words = lower
        .replace(/[^а-яёa-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4);
      for (const word of [...new Set(words)].slice(0, 10)) {
        patterns.push(`%${word}%`);
      }
    }

    return [...new Set(patterns)];
  }

  /**
   * Get spravochnik recommendations for a make+model+complaint combination.
   */
  async getRecommendations(
    tenantId: string,
    make: string,
    model: string,
    complaint: string,
  ): Promise<SpravochnikRecommendation> {
    const patterns = this.extractKeywords(complaint);

    if (patterns.length === 0) {
      return { services: [] };
    }

    // Query the spravochnik table
    const rows = await this.prisma.$queryRaw<
      {
        serviceDescription: string;
        partId: string | null;
        partName: string;
        partSku: string | null;
        partBrand: string | null;
        avgPrice: number;
        usageCount: number;
        relevance: number;
      }[]
    >`
      SELECT DISTINCT
        "serviceDescription",
        "partId",
        "partName",
        "partSku",
        "partBrand",
        "avgPrice",
        "usageCount",
        "relevance"
      FROM vehicle_part_stats
      WHERE "tenantId" = ${tenantId}
        AND make = UPPER(${make})
        AND model = UPPER(${model})
        AND ("serviceDescription" ILIKE ANY(${patterns}))
      ORDER BY "usageCount" DESC
    `;

    if (rows.length === 0) {
      return { services: [] };
    }

    // Look up real services from catalog by ILIKE matching service descriptions
    const uniqueDescriptions = [...new Set(rows.map((r) => r.serviceDescription))];
    const catalogServices = await this.prisma.service.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: uniqueDescriptions.map((desc) => ({
          name: { contains: desc.substring(0, 30), mode: 'insensitive' as const },
        })),
      },
      select: { id: true, name: true, price: true, normHours: true },
    });

    // Look up real part data (current price, stock, isActive)
    const uniquePartIds = [...new Set(rows.map((r) => r.partId).filter(Boolean))] as string[];
    const catalogParts =
      uniquePartIds.length > 0
        ? await this.prisma.part.findMany({
            where: { id: { in: uniquePartIds }, tenantId },
            select: { id: true, name: true, sku: true, sellPrice: true, currentStock: true, isActive: true },
          })
        : [];
    const partMap = new Map(catalogParts.map((p) => [p.id, p]));

    // Group rows by service description
    const serviceMap = new Map<
      string,
      {
        serviceDescription: string;
        parts: typeof rows;
      }
    >();

    for (const row of rows) {
      if (!serviceMap.has(row.serviceDescription)) {
        serviceMap.set(row.serviceDescription, {
          serviceDescription: row.serviceDescription,
          parts: [],
        });
      }
      serviceMap.get(row.serviceDescription)!.parts.push(row);
    }

    // Build result with real catalog data
    // Parts are already filtered by per-service relevance ≥35% in the stats table
    const services = [...serviceMap.values()].map((svc) => {
      // Find best matching catalog service
      const catalogMatch = catalogServices.find(
        (cs) =>
          cs.name.toLowerCase().includes(svc.serviceDescription.substring(0, 20).toLowerCase()) ||
          svc.serviceDescription.toLowerCase().includes(cs.name.substring(0, 20).toLowerCase()),
      );

      return {
        serviceDescription: svc.serviceDescription,
        serviceId: catalogMatch?.id || null,
        serviceName: catalogMatch?.name || null,
        servicePrice: catalogMatch ? Number(catalogMatch.price) : null,
        parts: svc.parts.map((p) => {
          const realPart = p.partId ? partMap.get(p.partId) : null;
          return {
            partId: p.partId,
            partName: realPart?.name || p.partName,
            partSku: realPart?.sku || p.partSku,
            partBrand: p.partBrand,
            avgPrice: Number(p.avgPrice),
            usageCount: Number(p.usageCount),
            currentStock: realPart?.currentStock ?? 0,
            currentPrice: realPart ? Number(realPart.sellPrice) : Number(p.avgPrice),
            isActive: realPart?.isActive ?? false,
          };
        }),
      };
    });

    return { services };
  }
}
