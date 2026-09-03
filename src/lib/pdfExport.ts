import { registerPlugin } from '@capacitor/core';

export interface PdfExportResult {
  /** content:// URI, ready to hand to the share sheet. */
  uri: string;
  path: string;
  bytes: number;
}

interface PdfExportPlugin {
  exportPdf(options: { html: string; fileName: string }): Promise<PdfExportResult>;
}

/**
 * Native PDF rendering, implemented in PdfExportPlugin.java.
 *
 * Android's print pipeline is used rather than a JavaScript PDF library: it
 * already has the system fonts and right-to-left shaping, so Arabic reports
 * come out correct, and it adds nothing to the web bundle.
 */
export const PdfExport = registerPlugin<PdfExportPlugin>('PdfExport');
