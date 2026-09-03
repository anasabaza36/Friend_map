import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LOCATION_HISTORY_RETENTION_MS } from './constants/location.constants';
import { LocationHistoryEntry, StoredLocation } from './types/location.types';

@Injectable()
export class LocationHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async saveEntry(userId: string, location: StoredLocation): Promise<void> {
    await this.prisma.locationHistory.create({
      data: {
        userId,
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        timestamp: new Date(location.timestamp),
      },
    });
  }

  async getOwnHistory(userId: string): Promise<LocationHistoryEntry[]> {
    await this.cleanupOldRecords();

    const records = await this.prisma.locationHistory.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });

    return records.map((record) => ({
      id: record.id,
      lat: record.lat,
      lng: record.lng,
      accuracy: record.accuracy,
      timestamp: record.timestamp.toISOString(),
      createdAt: record.createdAt.toISOString(),
    }));
  }

  async cleanupOldRecords(): Promise<number> {
    const cutoff = new Date(Date.now() - LOCATION_HISTORY_RETENTION_MS);

    const result = await this.prisma.locationHistory.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });

    return result.count;
  }
}
