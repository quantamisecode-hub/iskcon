import type { CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { APP_CONSTANTS, DONATION_TYPES } from '../../../constants/appConstants';
import { formatINR } from '../../inventory/api/inventory.api';
import type { FinancialFilters, FinancialLedger } from './financial.api';

const { brand, pdf: pdfStyle } = APP_CONSTANTS;

export interface LedgerReportData {
  data: FinancialLedger;
  filters: FinancialFilters;
}

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

const sectionStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.4,
  color: pdfStyle.colors.brand,
  marginBottom: 8,
};

function Money({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div style={{ border: `1px solid ${pdfStyle.colors.border}`, borderRadius: 6, padding: '9px 12px', background: highlight ? pdfStyle.colors.brandSoft : pdfStyle.colors.white }}>
      <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: pdfStyle.colors.muted }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: highlight ? pdfStyle.colors.brandDeep : pdfStyle.colors.ink }}>{formatINR(value)}</div>
    </div>
  );
}

/** Off-screen, print-ready ISKCON financial report. Inline styles ensure html2canvas fidelity. */
function LedgerReportDocument({ data, filters, logo }: LedgerReportData & { logo: string }) {
  const period = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom ?? 'Beginning'} to ${filters.dateTo ?? 'Today'}`
    : 'All recorded periods';
  const eventTypeLabel = filters.eventType ? ` · ${filters.eventType}` : '';
  const stockFilter = filters.stockType && filters.stockType !== 'ALL' ? filters.stockType : 'All stock types';
  const resultFilter = filters.result && filters.result !== 'ALL' ? filters.result.replace('_', ' ') : 'All results';
  const eventName = filters.eventId ? data.events.find((row) => row.id === filters.eventId)?.name : undefined;

  return (
    <div style={{
      boxSizing: 'border-box', width: pdfStyle.a4WidthPx, padding: '34px 40px',
      background: pdfStyle.colors.white, color: pdfStyle.colors.ink, fontFamily: pdfStyle.fontFamily,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: `3px solid ${pdfStyle.colors.brand}`, paddingBottom: 12 }}>
        {logo && <img src={logo} alt="" style={{ width: 60, height: 60, objectFit: 'contain' }} />}
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: pdfStyle.colors.brand }}>{brand.name}</div>
          <div style={{ fontSize: 10, color: pdfStyle.colors.secondary }}>{brand.description}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.4, color: pdfStyle.colors.brandDeep }}>INVENTORY &amp; FINANCIAL LEDGER</div>
          <div style={{ fontSize: 9, color: pdfStyle.colors.muted, marginTop: 3 }}>{period}</div>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: pdfStyle.colors.secondary }}>
        <strong>Filters:</strong> {eventName ?? 'All events'}{eventTypeLabel} · {stockFilter} · {resultFilter} · generated {new Date().toLocaleString('en-GB', { timeZone: APP_CONSTANTS.format.timeZone })}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={sectionStyle}>FINANCIAL OVERVIEW</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Money label="Cash donations" value={data.overview.cashDonations} />
          <Money label="Charity stock utilized" value={data.overview.charityStockUtilized} />
          <Money label="Expense stock consumed" value={data.overview.expenseStockConsumed} />
          <Money label="Other expenses" value={data.overview.otherExpenses} />
          <Money label="Total resource utilization" value={data.overview.totalResourceUtilization} highlight />
          <Money label="Cash surplus / deficit" value={data.overview.cashResult} highlight />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={sectionStyle}>EVENT FINANCIAL LEDGER</div>
        <div style={{ border: `1px solid ${pdfStyle.colors.border}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ display: 'flex', background: pdfStyle.colors.brand, color: pdfStyle.colors.white, fontSize: 8, fontWeight: 800, padding: '8px 8px' }}>
            <div style={{ width: 100 }}>Event</div>
            <div style={{ width: 58 }}>Date</div>
            <div style={{ width: 80 }}>Type</div>
            <div style={{ width: 72, textAlign: 'right' }}>Donations</div>
            <div style={{ width: 68, textAlign: 'right' }}>Charity</div>
            <div style={{ width: 68, textAlign: 'right' }}>Expense</div>
            <div style={{ width: 64, textAlign: 'right' }}>Other</div>
            <div style={{ width: 76, textAlign: 'right' }}>Resource</div>
            <div style={{ flex: 1, textAlign: 'right' }}>Cash result</div>
          </div>
          {data.events.map((row, index) => (
            <div key={row.id} style={{ display: 'flex', fontSize: 9, padding: '7px 8px', borderTop: `1px solid ${pdfStyle.colors.border}`, background: index % 2 ? pdfStyle.colors.white : '#fbf6ef' }}>
              <div style={{ width: 100, fontWeight: 700, paddingRight: 4 }}>{row.name}</div>
              <div style={{ width: 58, color: pdfStyle.colors.muted }}>{row.eventDate}</div>
              <div style={{ width: 80, color: pdfStyle.colors.muted }}>{row.eventType ?? '—'}</div>
              <div style={{ width: 72, textAlign: 'right' }}>{formatINR(row.donations)}</div>
              <div style={{ width: 68, textAlign: 'right' }}>{formatINR(row.charityStock)}</div>
              <div style={{ width: 68, textAlign: 'right' }}>{formatINR(row.expenseStock)}</div>
              <div style={{ width: 64, textAlign: 'right' }}>{formatINR(row.otherExpenses)}</div>
              <div style={{ width: 76, textAlign: 'right', fontWeight: 700 }}>{formatINR(row.resourceUtilization)}</div>
              <div style={{ flex: 1, textAlign: 'right', fontWeight: 800, color: row.cashResult >= 0 ? pdfStyle.colors.brand : '#b3261e' }}>{formatINR(row.cashResult)}</div>
            </div>
          ))}
          {data.events.length === 0 && (
            <div style={{ padding: 14, fontSize: 10, color: pdfStyle.colors.muted }}>No events matched the selected filters.</div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, borderTop: `1px solid ${pdfStyle.colors.border}`, paddingTop: 10 }}>
        <div style={sectionStyle}>DEFINITIONS</div>
        <div style={{ fontSize: 9, lineHeight: 1.6, color: pdfStyle.colors.secondary }}>
          <div><strong>Charity stock utilized</strong> — value of in-kind/donated stock consumed by events. Included in resource utilization, never treated as cash expenditure.</div>
          <div><strong>Expense stock consumed</strong> — value of organisation-funded stock consumed; counts toward cash event cost.</div>
          <div><strong>Total resource utilization</strong> = charity stock + expense stock + other expenses.</div>
          <div><strong>Cash event cost</strong> = expense stock + other expenses. <strong>Cash result</strong> = cash donations − cash event cost.</div>
          <div>Costs are taken from immutable FIFO allocation records; later purchases never rewrite historical event costs.</div>
        </div>
      </div>

      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 8, color: pdfStyle.colors.muted }}>
        Generated by {brand.name} {brand.description} · P&amp;L-style management view, not statutory accounting · {DONATION_TYPES.join(' / ')}
      </div>
    </div>
  );
}

export async function buildLedgerReportPdfBlob(report: LedgerReportData): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const logo = await loadLogoDataUrl();
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:${pdfStyle.offscreenLeftPx}px;top:0;width:${pdfStyle.a4WidthPx}px;z-index:-1;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<LedgerReportDocument {...report} logo={logo} />));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const canvas = await html2canvas(host.firstElementChild as HTMLElement, {
      scale: pdfStyle.renderScale, backgroundColor: pdfStyle.colors.white, useCORS: true,
    });
    const image = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: pdfStyle.orientation, unit: pdfStyle.unit, format: pdfStyle.a4Format });
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

export async function downloadLedgerReportPdf(report: LedgerReportData): Promise<void> {
  const blob = await buildLedgerReportPdfBlob(report);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `financial-ledger-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), pdfStyle.revokeObjectUrlDelayMs);
}
