package com.danehab.medicationidentifier;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Renders report HTML to a real PDF using Android's print pipeline,
        // which handles Arabic shaping that a JS PDF library would not.
        registerPlugin(PdfExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
