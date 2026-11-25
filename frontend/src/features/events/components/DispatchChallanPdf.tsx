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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: pdfStyle.colors.muted,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: pdfStyle.colors.ink }}>{value || dispatchConfig.unknownVerifier}</div>
    </div>
  );
}

/** The printable challan document. Inline styles guarantee html2canvas fidelity. */
function ChallanDocument({ event, destinationAddress, verifiedByName, logo }: DispatchChallanData & { logo: string; verifiedByName: string }) {
  const formattedEventDate = isoDateToDisplay(event.eventDate);

  const headerStyle: CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.4,
    color: pdfStyle.colors.brand,
    marginBottom: 8,
  };

  return (
    <div
      style={{
        boxSizing: 'border-box',
        width: pdfStyle.a4WidthPx,
        padding: '36px 44px',
        background: pdfStyle.colors.white,
        color: pdfStyle.colors.ink,
        fontFamily: pdfStyle.fontFamily,
      }}
    >
      {/* Brand header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          borderBottom: `3px solid ${pdfStyle.colors.brand}`,
          paddingBottom: 14,
        }}
      >
        {logo && <img src={logo} alt="" style={{ width: 68, height: 68, objectFit: 'contain' }} />}
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, color: pdfStyle.colors.brand, letterSpacing: 0.5 }}>{brand.name}</div>
          <div style={{ fontSize: 11, color: pdfStyle.colors.secondary, marginTop: 2 }}>{brand.description}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.5 }}>{brand.challanTitle}</div>
          <div style={{ fontSize: 11, color: pdfStyle.colors.muted, marginTop: 4, fontFamily: 'monospace' }}>
            {event.eventCode}
          </div>
        </div>
      </div>

      {/* Event + dispatch details */}
      <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={headerStyle}>EVENT DETAILS</div>
          <Field label="Name of Event" value={event.name} />
          <Field label="Event Type" value={event.eventType ?? ''} />
          <Field label="Serving Type" value={event.servingType ?? ''} />
          <Field label="Date" value={formattedEventDate} />
          <Field label="Start Time" value={formatTime12h(event.startTime)} />
          <Field label="Number of People" value={String(event.numberOfPeople)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={headerStyle}>DISPATCH DETAILS</div>
          <Field label="Destination Address" value={destinationAddress} />
          <Field label="Verified By" value={verifiedByName} />
          <Field label="Time of Dispatch" value={formatDateTime12h(event.dispatchedAt, format.timeZone, format.locale)} />
        </div>
      </div>

      {/* On-site contact details captured on the event's ADDRESS form */}
      <div style={{ marginTop: 16, borderTop: `1px solid ${pdfStyle.colors.border}`, paddingTop: 12 }}>
        <div style={headerStyle}>ADDRESS</div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <Field label="Contact Person" value={event.contactPerson ?? ''} />
            <Field label="Mobile Number" value={event.mobileNumber ?? ''} />
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Address" value={event.location ?? ''} />
            <Field label="Address Notes" value={event.notes ?? ''} />
          </div>
        </div>
      </div>

      {/* Prasad items */}
      <div style={{ marginTop: 14 }}>
        <div style={{ ...headerStyle, marginBottom: 6 }}>PRASAD ITEMS ({event.dishes.length})</div>
        <div style={{ border: `1px solid ${pdfStyle.colors.border}`, borderRadius: 6, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              background: pdfStyle.colors.brandSoft,
              fontSize: 10,
              fontWeight: 800,
              padding: '8px 12px',
            }}
          >
            <div style={{ width: 32 }}>#</div>
            <div style={{ flex: 1 }}>Dish / Prasad Item</div>
            <div style={{ width: 140, textAlign: 'right' }}>Quantity</div>
          </div>
          {event.dishes.map((dish, index) => (
            <div
              key={dish.id}
              style={{
                display: 'flex',
                padding: '9px 12px',
                borderTop: `1px solid ${pdfStyle.colors.border}`,
                fontSize: 12,
              }}
            >
              <div style={{ width: 32, fontWeight: 700 }}>{index + 1}</div>
              <div style={{ flex: 1, fontWeight: 700, paddingRight: 10 }}>{dish.dish.name}</div>
              <div style={{ width: 140, textAlign: 'right', color: pdfStyle.colors.cellText }}>
                {dish.quantity ?? event.numberOfPeople} {dish.quantityUnit ?? dishQuantityConfig.fallbackUnit}
              </div>
            </div>
          ))}
          {event.dishes.length === 0 && (
            <div style={{ padding: 14, fontSize: 11, color: pdfStyle.colors.muted }}>No dishes planned for this event.</div>
          )}
        </div>
      </div>

      {/* Sign-off */}
      <div style={{ display: 'flex', gap: 24, marginTop: 34, fontSize: 12 }}>
        <div style={{ flex: 1, borderTop: `1px solid ${pdfStyle.colors.secondary}`, paddingTop: 8 }}>
          <strong>Verified By: </strong>
          {verifiedByName}
        </div>
        <div style={{ flex: 1, borderTop: `1px solid ${pdfStyle.colors.secondary}`, paddingTop: 8 }}>
          Received By: ______________________
        </div>
      </div>
      <div style={{ marginTop: 22, textAlign: 'center', fontSize: 9, color: pdfStyle.colors.muted }}>
        Generated by {brand.name} {brand.description} · {event.eventCode}
      </div>
    </div>
  );
}

/**
 * Renders the challan off-screen and returns it as a multi-page A4 PDF blob.
 * The heavy PDF libraries are loaded lazily so the main bundle stays small.
 */
export async function buildDispatchChallanPdfBlob(data: DispatchChallanData): Promise<Blob> {
  const event = data.event;
  // Authoritative guards: never generate a challan from unsaved/invalid state,
  // and never trust a verifier name supplied by the browser.
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
      scale: pdfStyle.renderScale,
      backgroundColor: pdfStyle.colors.white,
      useCORS: true,
    });
    const image = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: pdfStyle.orientation,
      unit: pdfStyle.unit,
      format: pdfStyle.a4Format,
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageHeight = (canvas.height * pageWidth) / canvas.width;

    let heightLeft = imageHeight;
    let offset = 0;
    pdf.addImage(image, 'PNG', 0, offset, pageWidth, imageHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      offset = heightLeft - imageHeight;
      pdf.addPage();
      pdf.addImage(image, 'PNG', 0, offset, pageWidth, imageHeight);
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
