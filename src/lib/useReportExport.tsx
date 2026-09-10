import React, { useCallback, useRef, useState } from 'react';
import type { DrugInfo, PatientInfo } from '../types';
import { useLocalization } from '../context/LanguageContext';
import { renderReportHTML, renderReportText } from './report';
import { exportAsDocument, exportAsPdf } from './exportReport';
import { PatientDetailsDialog, hasPatientDetails, EMPTY_PATIENT_INFO } from '../components/PatientDetailsDialog';

/**
 * Exporting a report, and the one-time offer to put a patient's details on it.
 *
 * Two screens now hand the same page to a pharmacist — the result screen's
 * share button and the side effects screen's "Share this page" — and the rule
 * about when to ask for details is easy to get subtly different in two places.
 * It lives here once, along with the dialog itself.
 */

/**
 * Remembers that the details prompt has been shown once. After that, exports
 * run straight away — nobody wants a dialog between them and a file they have
 * already asked for twice.
 */
const PROMPTED_KEY = 'patientDetailsPrompted';

const wasPrompted = (): boolean => {
  try {
    return localStorage.getItem(PROMPTED_KEY) === '1';
  } catch {
    return false;
  }
};

const markPrompted = () => {
  try {
    localStorage.setItem(PROMPTED_KEY, '1');
  } catch {
    /* Private mode or storage disabled — the prompt simply shows again. */
  }
};

export interface ReportExport {
  /** Runs an export, offering the details step the first time only. */
  requestExport: (kind: 'pdf' | 'doc') => void;
  /** Opens the details form on its own, with no export waiting on it. */
  openDetails: () => void;
  /** Render this somewhere in the screen; it draws nothing while closed. */
  dialog: React.ReactElement;
}

export const useReportExport = (
  drugInfo: DrugInfo,
  patientInfo: PatientInfo,
  onPatientInfoChange: (info: Partial<PatientInfo>) => void,
): ReportExport => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** Which export is waiting on the dialog, if any. */
  const pending = useRef<'pdf' | 'doc' | null>(null);
  const { t, language } = useLocalization();

  // The details are passed in explicitly rather than read from the closure,
  // because an export can start in the same tick the dialog saves new ones.
  const run = useCallback(
    (kind: 'pdf' | 'doc', info: PatientInfo) => {
      const html = renderReportHTML(drugInfo, info, t, language);
      if (kind === 'pdf') {
        return exportAsPdf(drugInfo.drugName, html, renderReportText(drugInfo, info, t));
      }
      return exportAsDocument(
        drugInfo.drugName,
        html,
        renderReportText(drugInfo, info, t, { width: 60, numbered: true }),
      );
    },
    [drugInfo, language, t],
  );

  const requestExport = useCallback(
    (kind: 'pdf' | 'doc') => {
      if (!wasPrompted() && !hasPatientDetails(patientInfo)) {
        markPrompted();
        pending.current = kind;
        setDetailsOpen(true);
        return;
      }
      void run(kind, patientInfo);
    },
    [patientInfo, run],
  );

  const openDetails = useCallback(() => {
    pending.current = null;
    markPrompted();
    setDetailsOpen(true);
  }, []);

  const dialog = (
    <PatientDetailsDialog
      open={detailsOpen}
      patientInfo={patientInfo}
      pendingExport={pending.current !== null}
      onSave={(info) => {
        onPatientInfoChange(info);
        setDetailsOpen(false);
        const kind = pending.current;
        pending.current = null;
        if (kind) void run(kind, info);
      }}
      onDismiss={() => {
        setDetailsOpen(false);
        const kind = pending.current;
        pending.current = null;
        // Dismissing with an export waiting means "just give me the file".
        if (kind) void run(kind, patientInfo);
      }}
      onClear={() => onPatientInfoChange(EMPTY_PATIENT_INFO)}
    />
  );

  return { requestExport, openDetails, dialog };
};
