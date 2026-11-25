import type { CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { APP_CONSTANTS } from '../../../constants/appConstants';
import { formatDateTime12h, formatTime12h, isEventBeforeDispatch, isoDateToDisplay } from '../../../utils/dateTime';
import type { EventDetail } from '../types';

const { brand, format, pdf: pdfStyle, dispatch: dispatchConfig, dishQuantity: dishQuantityConfig } = APP_CONSTANTS;

export interface DispatchChallanData {
  event: EventDetail;
  destinationAddress: string;
}

/** Loads the public logo as an embedded data URL so html2canvas can draw it reliably. */
async function loadLogoDataUrl(): Promise<string> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = brand.logoPath;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo failed to load'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || pdfStyle.logoFallbackSizePx;
    canvas.height = img.naturalHeight || pdfStyle.logoFallbackSizePx;
    canvas.getContext('2d')?.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

function DataBox({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        padding: '6px 10px',
        minHeight: 44,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: '#64748b',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: highlight ? 700 : 600,
          color: highlight ? '#8a251a' : '#1e293b',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value || '—'}
      </div>
    </div>
  );
}

/** The modern printable challan document with structured dynamic container boxes. */
function ChallanDocument({
  event,
  destinationAddress,
  verifiedByName,
  logo,
}: DispatchChallanData & { logo: string; verifiedByName: string }) {
  const formattedEventDate = isoDateToDisplay(event.eventDate);
  const formattedDispatchTime = formatDateTime12h(event.dispatchedAt, format.timeZone, format.locale);

  const containerHeaderStyle: CSSProperties = {
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#8a251a',
    background: '#fdf4f2',
    padding: '6px 12px',
    borderBottom: '1px solid #f2dbd6',
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  return (
    <div
      style={{
        boxSizing: 'border-box',
        width: pdfStyle.a4WidthPx,
        padding: '24px 30px',
        background: '#ffffff',
        color: '#1e293b',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Brand Header Container */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2.5px solid #8a251a',
          paddingBottom: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {logo ? (
            <img src={logo} alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} />
          ) : (
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 8,
                background: '#8a251a',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 20,
              }}
            >
              IR
            </div>
          )}
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#8a251a', letterSpacing: 0.5, lineHeight: 1.1 }}>
              {brand.name}
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 500, marginTop: 3 }}>
              {brand.description}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              display: 'inline-block',
              background: '#8a251a',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 800,
              letterSpacing: 1,
              padding: '4px 10px',
              borderRadius: 4,
            }}
          >
            {brand.challanTitle}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              CHALLAN NO:
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                fontFamily: 'monospace',
                color: '#0f172a',
                background: '#f1f5f9',
                padding: '1.5px 6px',
                borderRadius: 3,
                border: '1px solid #e2e8f0',
              }}
            >
              {event.eventCode}
            </span>
          </div>
        </div>
      </div>

      {/* Row 1: Event Summary & Dispatch Details Containers */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        {/* Container A: Event Details */}
        <div
          style={{
            flex: 1,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#f8fafc',
            overflow: 'hidden',
          }}
        >
          <div style={containerHeaderStyle}>
            <span>1. EVENT INFORMATION</span>
            <span style={{ fontSize: 8.5, color: '#64748b', fontWeight: 600 }}>SCHEDULE & AUDIENCE</span>
          </div>
          <div style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <DataBox label="Event Name" value={event.name} highlight />
            <DataBox label="Event Type" value={event.eventType ?? 'Temple'} />
            <DataBox label="Event Date" value={formattedEventDate} />
            <DataBox label="Start Time" value={formatTime12h(event.startTime)} />
            <DataBox label="Serving Type" value={event.servingType ?? 'Plate'} />
            <DataBox label="Expected People" value={`${event.numberOfPeople} Persons`} highlight />
          </div>
        </div>

        {/* Container B: Dispatch Details */}
        <div
          style={{
            flex: 1,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#f8fafc',
            overflow: 'hidden',
          }}
        >
          <div style={containerHeaderStyle}>
            <span>2. DISPATCH & LOGISTICS</span>
            <span style={{ fontSize: 8.5, color: '#16a34a', fontWeight: 700 }}>STATUS: DISPATCHED</span>
          </div>
          <div style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <DataBox label="Destination Address" value={destinationAddress} highlight />
            <DataBox label="Time of Dispatch" value={formattedDispatchTime} />
            <DataBox label="Verified By" value={verifiedByName} />
            <DataBox
              label="Contact Person"
              value={event.contactPerson ? `${event.contactPerson} (${event.mobileNumber ?? ''})` : '—'}
            />
            <DataBox label="Venue Location" value={event.location ?? '—'} />
            <DataBox label="Donation Classification" value={event.donationType ?? 'FREE'} />
          </div>
        </div>
      </div>

      {/* Row 2: Prasad Items Table Container Box */}
      <div
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            background: '#8a251a',
            color: '#ffffff',
            padding: '7px 12px',
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>3. DISPATCHED PRASAD ITEMS ({event.dishes.length} ITEMS)</span>
          <span style={{ fontSize: 8.5, fontWeight: 600, opacity: 0.9 }}>VERIFY CONTAINERS BEFORE ACCEPTANCE</span>
        </div>

        {/* Table Thead */}
        <div
          style={{
            display: 'flex',
            background: '#f1f5f9',
            borderBottom: '1.5px solid #cbd5e1',
            fontSize: 9,
            fontWeight: 800,
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            padding: '6px 12px',
          }}
        >
          <div style={{ width: 32, textAlign: 'center' }}>#</div>
          <div style={{ flex: 1, paddingLeft: 4 }}>Prasad / Dish Description</div>
          <div style={{ width: 140, textAlign: 'right', paddingRight: 10 }}>Dispatched Quantity</div>
          <div style={{ width: 90, textAlign: 'center' }}>Check [✓]</div>
        </div>

        {/* Table Rows */}
        {event.dishes.map((dish, index) => (
          <div
            key={dish.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '7px 12px',
              borderBottom: index === event.dishes.length - 1 ? 'none' : '1px solid #e2e8f0',
              background: index % 2 === 0 ? '#ffffff' : '#f8fafc',
              fontSize: 10.5,
            }}
          >
            <div style={{ width: 32, textAlign: 'center', fontWeight: 700, color: '#64748b' }}>
              {index + 1}
            </div>
            <div style={{ flex: 1, fontWeight: 700, color: '#1e293b', paddingLeft: 4 }}>
              {dish.dish.name}
            </div>
            <div style={{ width: 140, textAlign: 'right', paddingRight: 10, fontWeight: 700, color: '#8a251a' }}>
              {dish.quantity ?? event.numberOfPeople} {dish.quantityUnit ?? dishQuantityConfig.fallbackUnit}
            </div>
            <div style={{ width: 90, display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: '1.5px solid #94a3b8',
                  borderRadius: 3,
                  background: '#ffffff',
                }}
              />
            </div>
          </div>
        ))}

        {event.dishes.length === 0 && (
          <div style={{ padding: 16, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
            No dishes recorded for this dispatch challan.
          </div>
        )}

        {/* Dynamic Notes Callout if present */}
        {event.notes && (
          <div
            style={{
              background: '#fffbeb',
              borderTop: '1px solid #fef3c7',
              padding: '6px 12px',
              fontSize: 9.5,
              color: '#92400e',
              display: 'flex',
              gap: 8,
            }}
          >
            <strong style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Special Instructions:</strong>
            <span>{event.notes}</span>
          </div>
        )}
      </div>

      {/* Row 3: Verification & Handover Sign-Off Boxes */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        {/* Verification Box */}
        <div
          style={{
            flex: 1,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#ffffff',
            padding: '10px 14px',
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: 4 }}>
            DISPATCH VERIFICATION (TEMPLE)
          </div>
          <div style={{ fontSize: 9, color: '#64748b', lineHeight: 1.3, marginBottom: 12 }}>
            Certified that all containers listed above were prepared hygienically and dispatched in intact condition.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, color: '#334155' }}>
            <div>
              <span style={{ color: '#64748b', fontSize: 9 }}>Verified By: </span>
              <strong>{verifiedByName}</strong>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ color: '#64748b', fontSize: 9 }}>Signature: </span>
              ___________________
            </div>
          </div>
        </div>

        {/* Handover Acknowledgement Box */}
        <div
          style={{
            flex: 1,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#ffffff',
            padding: '10px 14px',
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', color: '#475569', marginBottom: 4 }}>
            RECEIVER ACKNOWLEDGEMENT (ON-SITE)
          </div>
          <div style={{ fontSize: 9, color: '#64748b', lineHeight: 1.3, marginBottom: 12 }}>
            Received all containers listed above in good order and satisfactory physical count.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, color: '#334155' }}>
            <div>
              <span style={{ color: '#64748b', fontSize: 9 }}>Received By: </span>
              ___________________
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ color: '#64748b', fontSize: 9 }}>Signature: </span>
              ___________________
            </div>
          </div>
        </div>
      </div>

      {/* Footer bar */}
      <div
        style={{
          borderTop: '1px solid #e2e8f0',
          paddingTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 8.5,
          color: '#94a3b8',
        }}
      >
        <div>{brand.name} · Food Inventory & Dispatch Management</div>
        <div style={{ fontFamily: 'monospace' }}>EVENT CODE: {event.eventCode}</div>
        <div>Page 1 of 1</div>
      </div>
    </div>
  );
}

/**
 * Renders the challan off-screen and returns it as a compressed A4 PDF blob.
 * Uses JPEG compression at 0.82 quality and Flate compression to achieve
 * tiny file sizes (under 100-150 KBs) while keeping crisp layout.
 */
export async function buildDispatchChallanPdfBlob(data: DispatchChallanData): Promise<Blob> {
  const event = data.event;
  if (event.status !== 'READY' && event.status !== 'COMPLETED') {
    throw new Error('Only a Ready or Completed event can produce a dispatch challan.');
  }
  if (!event.dispatchedAt) {
    throw new Error('Save the dispatch details before generating the challan.');
  }
  if (!event.verifiedBy) {
    throw new Error('A saved verifier is required before generating the challan.');
  }
  const verifiedByName = `${event.verifiedBy.firstName} ${event.verifiedBy.lastName}`.trim();
  const dispatchAt = event.dispatchedAt;
  if (
    isEventBeforeDispatch(
      data.event.eventDate,
      data.event.startTime,
      dispatchAt,
      APP_CONSTANTS.format.timeZoneOffsetMinutes,
    )
  ) {
    throw new Error(APP_CONSTANTS.dispatch.messages.eventBeforeDispatch);
  }
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const logo = await loadLogoDataUrl();

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:${pdfStyle.offscreenLeftPx}px;top:0;width:${pdfStyle.a4WidthPx}px;z-index:-1;`;
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    flushSync(() => root.render(<ChallanDocument {...data} logo={logo} verifiedByName={verifiedByName} />));
    // Let the browser paint (and the embedded logo settle) before capturing.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const target = host.firstElementChild as HTMLElement;
    const canvas = await html2canvas(target, {
      scale: 1.8, // Crisp rendering without bloated canvas
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    // Use JPEG with quality 0.82 instead of heavy uncompressed PNG to compress to few KBs
    const image = canvas.toDataURL('image/jpeg', 0.82);

    const pdf = new jsPDF({
      orientation: pdfStyle.orientation,
      unit: pdfStyle.unit,
      format: pdfStyle.a4Format,
      compress: true, // Internal Flate compression
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageHeight = (canvas.height * pageWidth) / canvas.width;

    let heightLeft = imageHeight;
    let offset = 0;
    pdf.addImage(image, 'JPEG', 0, offset, pageWidth, imageHeight, undefined, 'FAST');
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      offset = heightLeft - imageHeight;
      pdf.addPage();
      pdf.addImage(image, 'JPEG', 0, offset, pageWidth, imageHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
    }

    return pdf.output('blob');
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Builds the challan and saves it under the event code. */
export async function downloadDispatchChallanPdf(data: DispatchChallanData): Promise<void> {
  const blob = await buildDispatchChallanPdfBlob(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${data.event.eventCode}${dispatchConfig.filenameSuffix}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Keep the blob URL alive long enough for the browser to finish the download.
  window.setTimeout(() => URL.revokeObjectURL(url), pdfStyle.revokeObjectUrlDelayMs);
}

