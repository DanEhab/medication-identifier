import type { DrugInfo, PatientInfo, ProfessionalDrugInfo } from '../types';
import type { translations } from './translations';

type TranslateFn = (key: keyof typeof translations.en) => string;

interface ReportSection {
  title: string;
  /** Rendered as a paragraph when a string, as a list when an array. */
  body: string | string[];
  /** Shown above the body as a warning line. */
  warning?: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * The clinical summary, as the same sections a patient report is built from.
 *
 * Sharing from the clinical screen used to export the patient record — the
 * comment said that was deliberate, "the thing a clinician hands to somebody",
 * but it means a clinician who reads the professional view and taps share gets
 * a page that says none of what they were just reading. The two views export
 * what they show.
 */
export const buildClinicalSections = (
  info: ProfessionalDrugInfo,
  t: TranslateFn,
): ReportSection[] => {
  const pk = info.pharmacokinetics;
  const kinetics = [
    pk.halfLife && `${t('halfLifeLabel')}: ${pk.halfLife}`,
    pk.absorption && `${t('absorptionLabel')}: ${pk.absorption}`,
    pk.distribution && `${t('distributionLabel')}: ${pk.distribution}`,
    pk.metabolism && `${t('metabolismLabel')}: ${pk.metabolism}`,
    pk.excretion && `${t('excretionLabel')}: ${pk.excretion}`,
  ].filter(Boolean) as string[];

  // A group's heading has to survive into a flat report, or the entries under
  // three different systems arrive as one undifferentiated list.
  const flattenGroups = (groups: { heading: string; items: string[] }[]): string[] =>
    groups.flatMap((group) =>
      group.items.map((item) => (group.heading ? `${group.heading}: ${item}` : item)));

  return [
    { title: t('classLabel'), body: info.drugClass },
    { title: t('indicationsLabel'), body: info.indications },
    { title: t('mechanismHeading'), body: info.mechanism },
    { title: t('pharmacokineticsHeading'), body: kinetics },
    { title: t('contraindicationsHeading'), body: info.contraindications },
    { title: t('atAGlanceLabel'), body: info.majorInteractions },
    { title: t('interactionsHeading'), body: flattenGroups(info.interactions) },
    { title: t('adverseEffectsHeading'), body: flattenGroups(info.adverseEffects) },
    { title: t('monitoringHeading'), body: info.monitoring },
    { title: t('chemistryLabel'), body: info.chemistry },
    { title: t('bcsLabel'), body: info.bcsClass },
    { title: t('referencesHeading'), body: info.references },
  ].filter((section) => (Array.isArray(section.body) ? section.body.length > 0 : Boolean(section.body?.trim())));
};

/**
 * The single source of truth for the patient report. All three export formats
 * (print/HTML, plain text, document) render from this, so they can no longer
 * drift apart the way the three hand-written generators did.
 */
export const buildReportSections = (drugInfo: DrugInfo, t: TranslateFn): ReportSection[] => [
  { title: t('commonUse'), body: drugInfo.commonUse },
  { title: t('dosageAdministration'), body: drugInfo.dosageAdministration },
  { title: t('missedDose'), body: drugInfo.missedDose },
  { title: t('foodDrinkInteractions'), body: drugInfo.foodDrinkEffect },
  { title: t('commonSideEffects'), body: drugInfo.commonSideEffects },
  {
    title: t('seriousSideEffects'),
    body: drugInfo.seriousSideEffects,
    warning: t('seekMedicalAttention'),
  },
  { title: t('whenToConsultDoctor'), body: drugInfo.consultDoctorWhen },
  { title: t('storage'), body: drugInfo.storage },
];

/** Sex is stored in English, so it has to be translated for an Arabic report. */
const SEX_KEYS: Record<Exclude<PatientInfo['sex'], ''>, keyof typeof translations.en> = {
  Male: 'male',
  Female: 'female',
  Other: 'other',
  'Prefer not to say': 'preferNotToSay',
};

const buildHeaderLines = (
  drugInfo: DrugInfo,
  patientInfo: PatientInfo,
  t: TranslateFn,
): string[] => {
  const lines = [`${t('drugName')}: ${drugInfo.drugName}`, `${t('strength')}: ${drugInfo.strength}`];
  // Every detail the user chose to give is printed. The diagnosis used to be
  // collected and then silently dropped from every export.
  if (patientInfo.name) lines.push(`${t('name')}: ${patientInfo.name}`);
  if (patientInfo.age) lines.push(`${t('age')}: ${patientInfo.age}`);
  if (patientInfo.sex) lines.push(`${t('sex')}: ${t(SEX_KEYS[patientInfo.sex])}`);
  if (patientInfo.diagnosis) lines.push(`${t('diagnosis')}: ${patientInfo.diagnosis}`);
  return lines;
};

/** Standalone HTML — used for printing and for the web .doc export. */
export const renderReportHTML = (
  drugInfo: DrugInfo,
  patientInfo: PatientInfo,
  t: TranslateFn,
  language: 'en' | 'ar',
  /** Supplied by the clinical screen, which exports what it shows. */
  override?: ReportSection[],
): string => {
  const sections = override ?? buildReportSections(drugInfo, t);
  const isRtl = language === 'ar';

  const renderBody = (section: ReportSection) => {
    const warning = section.warning
      ? `<p class="warning">⚠️ ${escapeHtml(section.warning)}</p>`
      : '';
    const body = Array.isArray(section.body)
      ? `<ul>${section.body.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : `<p>${escapeHtml(section.body)}</p>`;
    return warning + body;
  };

  return `<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(drugInfo.drugName)} - ${escapeHtml(t('report'))}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; line-height: 1.6; padding: 40px 20px; max-width: 800px; margin: 0 auto; background: #fff; }
  h1 { color: #2D3748; border-bottom: 3px solid #007B8A; padding-bottom: 15px; margin-bottom: 20px; font-size: 28px; }
  h3 { color: #2D3748; background-color: #EBF4F5; padding: 10px 15px; margin-top: 25px; margin-bottom: 10px; font-size: 18px; border-${isRtl ? 'right' : 'left'}: 4px solid #007B8A; }
  .patient-info { background: #f9f9f9; padding: 15px; border-${isRtl ? 'right' : 'left'}: 4px solid #007B8A; margin-bottom: 25px; line-height: 1.8; }
  .patient-info p { margin: 5px 0; }
  p { margin: 10px 0; color: #333; }
  ul { margin: 10px 0; padding-${isRtl ? 'right' : 'left'}: 25px; }
  li { margin-bottom: 8px; color: #333; }
  .warning { color: #C53030; font-weight: bold; }
  .disclaimer { margin-top: 35px; padding: 15px; background: #FFF5F5; border: 1px solid #FEB2B2; color: #742A2A; font-size: 13px; }
  .footer { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }
</style>
</head>
<body>
<h1>${escapeHtml(drugInfo.drugName)}</h1>
<div class="patient-info">
${buildHeaderLines(drugInfo, patientInfo, t)
  .map((line) => `  <p>${escapeHtml(line)}</p>`)
  .join('\n')}
</div>
${sections
  .map((section) => `<h3>${escapeHtml(section.title)}</h3>\n${renderBody(section)}`)
  .join('\n')}
<p class="disclaimer"><strong>${escapeHtml(t('disclaimer'))}:</strong> ${escapeHtml(t('disclaimerText'))}</p>
<p class="footer">${escapeHtml(t('report'))} — ${new Date().toLocaleString()}</p>
</body>
</html>`;
};

/**
 * Plain-text report. `width` controls the rule length and `numbered` switches
 * bullets for numbers — the only two things that differed between the old
 * generateReportText and generateDocContent.
 */
export const renderReportText = (
  drugInfo: DrugInfo,
  patientInfo: PatientInfo,
  t: TranslateFn,
  { width = 50, numbered = false, override }:
    { width?: number; numbered?: boolean; override?: ReportSection[] } = {},
): string => {
  const lines: string[] = [
    t('report').toUpperCase(),
    drugInfo.drugName,
    '='.repeat(width),
    '',
    ...buildHeaderLines(drugInfo, patientInfo, t),
    '',
    '='.repeat(width),
  ];

  for (const section of override ?? buildReportSections(drugInfo, t)) {
    lines.push('', section.title.toUpperCase(), '-'.repeat(width));
    if (section.warning) lines.push(`⚠️ ${section.warning}`);
    if (Array.isArray(section.body)) {
      lines.push(
        ...section.body.map((item, index) => (numbered ? `${index + 1}. ${item}` : `• ${item}`)),
      );
    } else {
      lines.push(section.body);
    }
  }

  lines.push(
    '',
    '='.repeat(width),
    `${t('disclaimer').toUpperCase()}: ${t('disclaimerText')}`,
    '',
    `${t('report')}: ${new Date().toLocaleString()}`,
  );
  return lines.join('\n');
};
