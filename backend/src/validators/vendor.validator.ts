import { z } from 'zod';

/** Master-data vendor schema. `.strict()` rejects unknown/unexpected fields. */
export const vendorSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    contactPerson: z.string().trim().max(100).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    state: z.string().trim().max(100).nullable().optional(),
    gstNumber: z.string().trim().max(15).nullable().optional(),
    paymentTerms: z.string().trim().max(100).nullable().optional(),
    notes: z.string().trim().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

/** PATCH: every field optional, still strict about unknown keys. */
export const vendorUpdateSchema = vendorSchema.partial();

export type CreateVendorInput = z.infer<typeof vendorSchema>;
export type UpdateVendorInput = z.infer<typeof vendorUpdateSchema>;
