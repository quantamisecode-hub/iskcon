import type { Prisma, Vendor } from '@prisma/client';
import { prisma } from './user.repository.js';

export interface VendorRecordData {
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  gstNumber?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export const vendorRepository = {
  async findAll(input: { where?: Prisma.VendorWhereInput; take?: number; skip?: number }): Promise<Vendor[]> {
    return prisma.vendor.findMany({
      where: input.where,
      orderBy: { name: 'asc' },
      take: input.take,
      skip: input.skip,
    });
  },

  async findById(id: string): Promise<Vendor | null> {
    return prisma.vendor.findUnique({ where: { id } });
  },

  async findByName(name: string): Promise<Vendor | null> {
    return prisma.vendor.findUnique({ where: { name } });
  },

  async create(data: VendorRecordData): Promise<Vendor> {
    return prisma.vendor.create({ data });
  },

  async update(id: string, data: Partial<VendorRecordData>): Promise<Vendor> {
    return prisma.vendor.update({ where: { id }, data });
  },

  async count(where: Prisma.VendorWhereInput): Promise<number> {
    return prisma.vendor.count({ where });
  },
};
