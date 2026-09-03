package android.print;

/**
 * PrintDocumentAdapter.LayoutResultCallback and WriteResultCallback both have
 * package-private constructors, so they cannot be subclassed from application
 * code. Declaring these shims inside android.print is the standard way round
 * it, and lets PdfExportPlugin drive the print pipeline directly instead of
 * showing the system print dialog.
 */
public final class PdfPrintCallbacks {

    public abstract static class Layout extends PrintDocumentAdapter.LayoutResultCallback {
        public Layout() {
            super();
        }
    }

    public abstract static class Write extends PrintDocumentAdapter.WriteResultCallback {
        public Write() {
            super();
        }
    }

    private PdfPrintCallbacks() {}
}
