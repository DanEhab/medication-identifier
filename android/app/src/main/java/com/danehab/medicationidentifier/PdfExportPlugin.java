package com.danehab.medicationidentifier;

import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PdfPrintCallbacks;
import android.print.PrintDocumentAdapter;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Renders HTML to a real PDF using Android's own print pipeline.
 *
 * The app used to claim it produced PDFs but actually wrote an .html file and
 * asked the user to open Chrome and print it themselves. Doing this natively
 * keeps that promise, and — unlike a JavaScript PDF library — renders Arabic
 * correctly, because the system WebView already has the fonts and the
 * right-to-left shaping.
 */
@CapacitorPlugin(name = "PdfExport")
public class PdfExportPlugin extends Plugin {

    /** Held for the lifetime of the render so it is not garbage collected mid-print. */
    private WebView printWebView;

    @PluginMethod
    public void exportPdf(final PluginCall call) {
        final String html = call.getString("html");
        final String fileName = sanitise(call.getString("fileName", "report"));

        if (html == null || html.isEmpty()) {
            call.reject("No HTML was supplied to render.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                renderToPdf(html, fileName, call);
            } catch (Exception e) {
                call.reject("Could not create the PDF: " + e.getMessage(), e);
            }
        });
    }

    private void renderToPdf(String html, String fileName, final PluginCall call) {
        final WebView webView = new WebView(getContext());
        printWebView = webView;

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                // The page is laid out; hand it to the print framework.
                try {
                    writePdf(view, fileName, call);
                } catch (Exception e) {
                    printWebView = null;
                    call.reject("Could not create the PDF: " + e.getMessage(), e);
                }
            }
        });

        // Load as base64 so the markup survives regardless of its own encoding.
        String encoded = Base64.encodeToString(html.getBytes(), Base64.NO_PADDING);
        webView.loadData(encoded, "text/html", "base64");
    }

    private void writePdf(WebView view, String fileName, final PluginCall call) throws Exception {
        final File outputDir = new File(getContext().getCacheDir(), "reports");
        if (!outputDir.exists() && !outputDir.mkdirs()) {
            throw new IllegalStateException("Could not create the reports folder.");
        }
        final File outputFile = new File(outputDir, fileName + ".pdf");

        PrintAttributes attributes = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build();

        final PrintDocumentAdapter adapter = Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP
                ? view.createPrintDocumentAdapter(fileName)
                : view.createPrintDocumentAdapter();

        adapter.onLayout(null, attributes, null, new PdfPrintCallbacks.Layout() {
            @Override
            public void onLayoutFinished(android.print.PrintDocumentInfo info, boolean changed) {
                try {
                    ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(
                            outputFile, ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_READ_WRITE);

                    adapter.onWrite(
                            new PageRange[]{PageRange.ALL_PAGES},
                            descriptor,
                            new CancellationSignal(),
                            new PdfPrintCallbacks.Write() {
                                @Override
                                public void onWriteFinished(PageRange[] pages) {
                                    printWebView = null;
                                    try {
                                        // Capacitor's Share plugin wraps this in its own
                                        // FileProvider, so it wants a file:// URI — a
                                        // content:// one is rejected as "Unsupported url".
                                        JSObject result = new JSObject();
                                        result.put("uri", Uri.fromFile(outputFile).toString());
                                        result.put("path", outputFile.getAbsolutePath());
                                        result.put("bytes", outputFile.length());
                                        call.resolve(result);
                                    } catch (Exception e) {
                                        call.reject("The PDF was written but could not be returned: " + e.getMessage(), e);
                                    }
                                }

                                @Override
                                public void onWriteFailed(CharSequence error) {
                                    printWebView = null;
                                    call.reject("Writing the PDF failed: " + error);
                                }
                            });
                } catch (Exception e) {
                    printWebView = null;
                    call.reject("Could not open the PDF for writing: " + e.getMessage(), e);
                }
            }

            @Override
            public void onLayoutFailed(CharSequence error) {
                printWebView = null;
                call.reject("Laying out the PDF failed: " + error);
            }
        }, new Bundle());
    }

    /** Keeps the filename safe for the filesystem and for sharing. */
    private String sanitise(String name) {
        if (name == null || name.trim().isEmpty()) return "report";
        String cleaned = name.replaceAll("[^a-zA-Z0-9\\-_]", "_");
        return cleaned.length() > 60 ? cleaned.substring(0, 60) : cleaned;
    }
}
