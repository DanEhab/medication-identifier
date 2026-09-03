import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { PdfExport } from './pdfExport';

const safeFileName = (drugName: string, extension: string) => {
  // Filenames have to survive every filesystem and share target, so anything
  // outside [A-Za-z0-9] is stripped. An Arabic name reduces to nothing but
  // underscores, so fall back to something readable rather than "____.pdf".
  const stem = drugName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const base = /[a-zA-Z0-9]/.test(stem) ? stem : 'medication-report';
  return `${base}_${Date.now()}.${extension}`;
};

const wasCancelled = (error: unknown) =>
  error instanceof Error && /cancel/i.test(error.message);

/**
 * Writes the report to external storage and opens the share sheet.
 * Android has no API for an app to produce a PDF directly, so the print flow
 * hands Chrome an HTML file and the user prints to PDF from there.
 */
const shareNativeFile = async (
  content: string,
  fileName: string,
  share: { title: string; text: string; dialogTitle: string },
  fallbackText: string,
) => {
  try {
    const result = await Filesystem.writeFile({
      path: fileName,
      data: content,
      directory: Directory.External,
      encoding: Encoding.UTF8,
    });

    await Share.share({ ...share, url: result.uri, files: [result.uri] });
  } catch (error) {
    if (wasCancelled(error)) return;
    console.error('[exportReport] native share failed, falling back to text', error);
    try {
      await Share.share({ title: share.title, text: fallbackText, dialogTitle: share.dialogTitle });
    } catch (fallbackError) {
      if (!wasCancelled(fallbackError)) {
        console.error('[exportReport] text fallback failed', fallbackError);
        throw fallbackError;
      }
    }
  }
};

/** Triggers a browser download for a generated file. */
const downloadInBrowser = (content: string, fileName: string, mimeType: string) => {
  const blob = new Blob(['\ufeff', content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportAsPdf = async (drugName: string, html: string, plainText: string) => {
  // In a browser the print dialog already offers "Save as PDF".
  if (!Capacitor.isNativePlatform()) {
    window.print();
    return;
  }

  try {
    // A genuine PDF, rendered by Android's print pipeline so Arabic shapes
    // correctly. Previously this wrote an .html file and asked the user to
    // open Chrome and print it themselves.
    const { uri } = await PdfExport.exportPdf({
      html,
      fileName: safeFileName(drugName, '').replace(/\.$/, ''),
    });

    await Share.share({
      title: `${drugName} report`,
      dialogTitle: 'Share report',
      files: [uri],
    });
  } catch (error) {
    if (wasCancelled(error)) return;
    console.error('[exportReport] PDF export failed, sharing text instead', error);

    // If rendering fails there is still something useful to hand over.
    try {
      await Share.share({
        title: `${drugName} report`,
        text: plainText,
        dialogTitle: 'Share report',
      });
    } catch (fallbackError) {
      if (!wasCancelled(fallbackError)) throw fallbackError;
    }
  }
};

export const exportAsDocument = async (drugName: string, html: string, plainText: string) => {
  // Word opens HTML saved as .doc natively, so this is a real Word document.
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(html, `${drugName}_Report.doc`, 'application/msword');
    return;
  }

  await shareNativeFile(
    html,
    safeFileName(drugName, 'doc'),
    {
      title: 'Open with a document app',
      text: 'Choose Google Docs or Microsoft Word to open and edit.',
      dialogTitle: 'Select a document app',
    },
    plainText,
  );
};
