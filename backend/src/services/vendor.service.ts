import type { Prisma, Vendor } from '@prisma/client';
import { vendorRepository } from '../repositories/vendor.repository.js';
import { auditLogService } from '../services/auditLog.service.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { prisma } from '../config/database.js';
import { requireVendorAdmin, type VendorActor } from '../policies/vendor.policy.js';

export interface VendorListFilters {
  isActive?: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

/** All optional fields are nullable in the database; callers pass null to clear. */
export interface VendorInput {
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

/** Shared API shape so every vendor endpoint serializes identically. */
export type VendorRow = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  gstNumber: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Public shape of a vendor audit-history entry. */
export type VendorAuditEntry = {
  id: string;
  action: string;
  entityId: string | null;
  actorName: string | null;
  createdAt: string;
  oldValues: Prisma.JsonValue | null;
  newValues: Prisma.JsonValue | null;
};

/** Convert a Prisma Vendor row into the public VendorRow (ISO date strings). */
export const serializeVendor = (vendor: Vendor): VendorRow => ({
  id: vendor.id,
  name: vendor.name,
  contactPerson: vendor.contactPerson ?? null,
  phone: vendor.phone ?? null,
  email: vendor.email ?? null,
  address: vendor.address ?? null,
  city: vendor.city ?? null,
  state: vendor.state ?? null,
  gstNumber: vendor.gstNumber ?? null,
  paymentTerms: vendor.paymentTerms ?? null,
  notes: vendor.notes ?? null,
  isActive: vendor.isActive,
  createdAt: vendor.createdAt instanceof Date ? vendor.createdAt.toISOString() : String(vendor.createdAt),
  updatedAt: vendor.updatedAt instanceof Date ? vendor.updatedAt.toISOString() : String(vendor.updatedAt),
});

export const vendorService = {
  async list(actor: VendorActor, filters: VendorListFilters): Promise<{ vendors: VendorRow[]; total: number; page: number; pageSize: number }> {
    requireVendorAdmin(actor);
    const where = {
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      // MySQL string columns are case-insensitive by default (utf8mb4_unicode_ci),
      // so Prisma's PostgreSQL-only `mode: 'insensitive'` is intentionally omitted.
      ...(filters.search ? { name: { contains: filters.search } } : {}),
    };
    const [vendors, total] = await Promise.all([
      vendorRepository.findAll({ where, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
      vendorRepository.count(where),
    ]);
    return {
      vendors: vendors.map(serializeVendor),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  },

  async getById(actor: VendorActor, id: string): Promise<VendorRow> {
    requireVendorAdmin(actor);
    const vendor = await vendorRepository.findById(id);
    if (!vendor) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Vendor not found.' });
    }
    return serializeVendor(vendor);
  },

  async create(actor: VendorActor, input: VendorInput, context: { ipAddress?: string; userAgent?: string }): Promise<VendorRow> {
    requireVendorAdmin(actor);
    const existing = await vendorRepository.findByName(input.name);
    if (existing) {
      throw new ApiError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message: 'A vendor with this name already exists.' });
    }
    const created = await vendorRepository.create({
      name: input.name,
      contactPerson: input.contactPerson ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      gstNumber: input.gstNumber ?? null,
      paymentTerms: input.paymentTerms ?? null,
      notes: input.notes ?? null,
      isActive: input.isActive ?? true,
    });
    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE_VENDOR,
      entityType: 'VENDOR',
      entityId: created.id,
      newValues: serializeVendor(created),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return serializeVendor(created);
  },

  async update(id: string, actor: VendorActor, input: Partial<VendorInput>, context: { ipAddress?: string; userAgent?: string }): Promise<VendorRow> {
    requireVendorAdmin(actor);
    const vendor = await vendorRepository.findById(id);
    if (!vendor) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Vendor not found.' });
    }

    if (input.name !== undefined && input.name !== vendor.name) {
      const existing = await vendorRepository.findByName(input.name);
      if (existing && existing.id !== id) {
        throw new ApiError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message: 'A vendor with this name already exists.' });
      }
    }

    const data: Partial<VendorInput> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.contactPerson !== undefined) data.contactPerson = input.contactPerson;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.email !== undefined) data.email = input.email;
    if (input.address !== undefined) data.address = input.address;
    if (input.city !== undefined) data.city = input.city;
    if (input.state !== undefined) data.state = input.state;
    if (input.gstNumber !== undefined) data.gstNumber = input.gstNumber;
    if (input.paymentTerms !== undefined) data.paymentTerms = input.paymentTerms;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await vendorRepository.update(id, data);
    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.UPDATE_VENDOR,
      entityType: 'VENDOR',
      entityId: updated.id,
      oldValues: serializeVendor(vendor),
      newValues: serializeVendor(updated),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return serializeVendor(updated);
  },

  async getAuditHistory(actor: VendorActor, id?: string): Promise<VendorAuditEntry[]> {
    requireVendorAdmin(actor);
    const rows = await prisma.auditLog.findMany({
      where: { entityType: 'VENDOR', ...(id ? { entityId: id } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityId: row.entityId,
      actorName: row.user ? `${row.user.firstName} ${row.user.lastName}` : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      oldValues: row.oldValues,
      newValues: row.newValues,
    }));
  },

  async activate(actor: VendorActor, id: string, context: { ipAddress?: string; userAgent?: string }): Promise<VendorRow> {
    requireVendorAdmin(actor);
    const vendor = await vendorRepository.findById(id);
    if (!vendor) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Vendor not found.' });
    }
    const updated = await vendorRepository.update(id, { isActive: true });
    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.ACTIVATE_VENDOR,
      entityType: 'VENDOR',
      entityId: vendor.id,
      oldValues: { name: vendor.name, isActive: vendor.isActive },
      newValues: { name: vendor.name, isActive: true },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return serializeVendor(updated);
  },

  async deactivate(actor: VendorActor, id: string, context: { ipAddress?: string; userAgent?: string }): Promise<VendorRow> {
    requireVendorAdmin(actor);
    const vendor = await vendorRepository.findById(id);
    if (!vendor) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Vendor not found.' });
    }
    // Never deactivate a vendor still referenced by the stock ledger — those
    // movements would point at a supplier that can no longer be selected.
    const linked = await prisma.inventoryTransaction.count({ where: { vendorId: id } });
    if (linked > 0) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: `“${vendor.name}” is linked to ${linked} stock transaction(s) and cannot be deactivated.`,
      });
    }
    const updated = await vendorRepository.update(id, { isActive: false });
    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.DEACTIVATE_VENDOR,
      entityType: 'VENDOR',
      entityId: vendor.id,
      oldValues: { name: vendor.name, isActive: vendor.isActive },
      newValues: { name: vendor.name, isActive: false },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return serializeVendor(updated);
  },

  /** Kept for backwards compatibility: deactivation is the safe delete. */
  async delete(id: string, actor: VendorActor, context: { ipAddress?: string; userAgent?: string }): Promise<void> {
    requireVendorAdmin(actor);
    await vendorService.deactivate(actor, id, context);
  },
};
