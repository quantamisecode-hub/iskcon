/** Application-wide, non-secret display/domain constants. */
/** Serving/packing units offered for a dish's planned quantity. */
export const DISH_QUANTITY_UNITS = ['Kg', 'Ltrs', 'Dona', 'Plate', 'Piece', 'Bowl', 'Packet'] as const;
export const EVENT_TYPES = ['BACE', 'Temple', 'FFL Distribution', 'Outside Special Event'] as const;
/** Historical value used before BACE and Temple became separate types. */
export const LEGACY_EVENT_TYPES = ['BACE, Temple'] as const;
export const SERVING_TYPES = ['Dona', 'Plate'] as const;
export const DONATION_TYPES = ['DONATION', 'FREE'] as const;
/** Financially meaningful stock classification, allowed only on StockLot. */
export const STOCK_TYPES = ['CHARITY', 'EXPENSE'] as const;
/** Non-inventory event expense categories (admin-only). */
export const EVENT_EXPENSE_CATEGORIES = ['GAS', 'TRANSPORT', 'LABOUR', 'OTHER'] as const;

export const APP_CONSTANTS = {
  timeZone: 'Asia/Kolkata',
  locale: 'en-GB',
  dispatch: {
    destinationAddressMaxLength: 500,
  },
  dishQuantity: {
    max: 100_000,
  },
  event: {
    eventTypeMaxLength: 50,
    servingTypeMaxLength: 20,
    contactPersonMaxLength: 100,
    mobileNumberMaxLength: 30,
    donationTrNumberMaxLength: 50,
    donationTypeMaxLength: 20,
  },
} as const;

/** Fixed IST offset (Asia/Kolkata has no DST). */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
