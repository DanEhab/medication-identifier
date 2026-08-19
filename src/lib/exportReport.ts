import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const safeFileName = (drugName: string, extension: string) =>
  `${drugName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${extension}`;

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
  if (!Capacitor.isNativePlatform()) {
    window.print();
    return;
  }

  await shareNativeFile(
    html,
    safeFileName(drugName, 'html'),
    {
      title: 'Open in Chrome to save as PDF',
      text: 'Choose Chrome, then use the menu → Print → Save as PDF.',
      dialogTitle: 'Select a browser',
    },
    plainText,
  );
};

export const exportAsDocument = async (drugName: string, html: string, plainText: string) => {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(html, `${drugName}_Report.doc`, 'application/msword');
    return;
  }

  await shareNativeFile(
    plainText,
    safeFileName(drugName, 'txt'),
    {
      title: 'Open with a document app',
      text: 'Choose Google Docs or Microsoft Word to edit and save.',
      dialogTitle: 'Select a document app',
    },
    plainText,
  );
};
