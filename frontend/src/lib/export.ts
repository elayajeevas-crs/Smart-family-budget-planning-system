import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface Column<T> {
  header: string;
  value: (row: T) => string | number;
}

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportCsv<T>(filename: string, columns: Column<T>[], rows: T[]) {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(c.value(r))).join(','));
  // BOM so Excel opens UTF-8 correctly
  download(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
}

export interface PdfTable {
  title: string;
  head: string[];
  body: (string | number)[][];
}

export function exportPdf(filename: string, title: string, subtitle: string, summary: [string, string][], tables: PdfTable[]) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text(title, margin, 50);
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, margin, 68);
  doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, margin, 82);

  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = 104;
  if (summary.length) {
    autoTable(doc, {
      startY: y,
      body: summary.map(([k, v]) => [k, v]),
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 180 } },
      margin: { left: margin, right: margin },
    });
    y = lastY() + 18;
  }

  for (const t of tables) {
    if (y > 700) {
      doc.addPage();
      y = 50;
    }
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text(t.title, margin, y);
    autoTable(doc, {
      startY: y + 8,
      head: [t.head],
      body: t.body.length ? t.body : [['No data', ...Array(Math.max(0, t.head.length - 1)).fill('')]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] },
      margin: { left: margin, right: margin },
    });
    y = lastY() + 22;
  }
  doc.save(filename);
}
