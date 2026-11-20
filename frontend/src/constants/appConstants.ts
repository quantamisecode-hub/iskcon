/**
 * Application-wide display constants.
 *
 * The PDF generator and the rest of the UI must not carry their own copies of
 * brand identity, locale/format settings or document layout values.
 */
/** Event categories offered in the create/edit form. */
export const EVENT_TYPES = ['BACE, Temple', 'FFL Distribution', 'Outside Special Event'] as const;
/** Event-level serving style offered next to Number of people. */
export const SERVING_TYPES = ['Dona', 'Plate'] as const;
export const DONATION_TYPES = ['DONATION', 'FREE'] as const;

export const APP_CONSTANTS = {
  brand: {
    name: 'ISKCON',
    description: 'Food Inventory & Material Management',
    logoPath: '/iskcon-logo.png',
    challanTitle: 'PRASAD DISPATCH CHALLAN',
  },
  format: {
    locale: 'en-GB',
    timeZone: 'Asia/Kolkata',
    timeZoneOffsetMinutes: 330, // Asia/Kolkata has no DST
  },
  /** Money is always rendered through formatINR() — no literal ₹ in components. */
  currency: {
    locale: 'en-IN',
    code: 'INR',
  },
  /** Fractional quantities (kg, litres) are stored/entered to 3 decimals. */
  quantityPrecision: 3,
  pdf: {
    // A4 at 96 dpi; jsPDF uses the same logical page size in millimetres.
    a4WidthPx: 794,
    a4Format: 'a4',
    orientation: 'portrait',
    unit: 'mm',
    renderScale: 2,
    logoFallbackSizePx: 200,
    revokeObjectUrlDelayMs: 60_000,
    offscreenLeftPx: -10_000,
    fontFamily: 'Arial, Helvetica, sans-serif',
    colors: {
      white: '#ffffff',
      ink: '#1f1f1f',
      muted: '#9a8c80',
      secondary: '#6f6257',
      brand: '#b84234',
      brandDeep: '#7a2c22',
      brandSoft: '#f3ddd6',
      border: '#e8ddd1',
      subtleText: '#4b5563',
      cellText: '#374151',
    },
  },
  event: {
    contactPersonMaxLength: 100,
    mobileNumberMaxLength: 30,
    donationTrNumberMaxLength: 50,
    donationTypeLabels: { DONATION: 'Donation', FREE: 'Free' },
  },
  dishQuantity: {
    units: ['Kg', 'Ltrs', 'Dona', 'Plate', 'Piece', 'Bowl', 'Packet'],
    fallbackUnit: 'Plate',
    max: 100_000,
  },
  dispatch: {
    destinationAddressMaxLength: 500,
    filenameSuffix: '-dispatch-challan.pdf',
    unknownVerifier: '—',
    messages: {
      destinationRequired: 'A destination address is required.',
      verifierRequired: 'Please select who verified the dispatch.',
      destinationRequiredForPrint: 'A destination address is required before printing.',
      verifierRequiredForPrint: 'Select a verifier before printing.',
      verifiersLoadFailed: 'Unable to load the executor list. Please try again.',
      pdfFailed: 'Unable to generate the PDF. Please try again.',
      eventBeforeDispatch: 'The event date and time cannot be earlier than the date and time of dispatch.',
      saved: 'Dispatch details saved. Event status unchanged.',
      noVerifiers: "No active executors are assigned to this event's admin.",
    },
  },
} as const;
