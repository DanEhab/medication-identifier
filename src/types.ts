export type Language = 'en' | 'ar';

/** What the service decided the query actually is. */
export type Recognition = 'medication' | 'substance' | 'unknown';

/**
 * Raised when a search did not resolve to a medication — either because it is a
 * real substance that is not a medicine, or because it was not recognised at
 * all. Carries what the service worked out so the UI can explain rather than
 * showing a generic failure.
 */
export class NotAMedicationError extends Error {
  readonly recognition: Exclude<Recognition, 'medication'>;
  readonly query: string;
  readonly identifiedAs: string;
  readonly safetyNote: string;

  constructor(args: {
    recognition: Exclude<Recognition, 'medication'>;
    query: string;
    identifiedAs: string;
    safetyNote: string;
  }) {
    super(args.identifiedAs || `"${args.query}" is not a medication.`);
    this.name = 'NotAMedicationError';
    this.recognition = args.recognition;
    this.query = args.query;
    this.identifiedAs = args.identifiedAs;
    this.safetyNote = args.safetyNote;
  }
}

/** The service asked the caller to slow down. Not a failure — just a wait. */
export class RateLimitedError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'RateLimitedError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface NotAMedicationResult {
  recognition: Exclude<Recognition, 'medication'>;
  query: string;
  identifiedAs: string;
  safetyNote: string;
}

export interface DrugInfo {
  drugName: string;
  strength: string;
  // The result screen's own fields. Optional because a medicine saved to the
  // phone before the redesign has none of them, and an old saved card must
  // still open rather than crash.
  canonicalName?: string;
  brandName?: string;
  whatItIsFor?: string;
  howToTake?: string;
  tellYourDoctorIf?: string;
  neverWith?: string;
  quickDose?: string;
  quickDoseNote?: string;
  quickTiming?: string;
  quickTimingNote?: string;
  quickFood?: string;
  quickFoodNote?: string;
  commonUse: string;
  dosageAdministration: string;
  foodDrinkEffect: string;
  missedDose: string;
  commonSideEffects: string[];
  seriousSideEffects: string[];
  consultDoctorWhen: string[];
  storage: string;
}

/**
 * The clinician's view. Every field is a plain string or a list of them: the
 * server flattens whatever shape the model used, so nothing here is `any` and
 * the screen cannot be handed a nested object to render.
 */
export interface ProfessionalDrugInfo {
    genericName: string;
    /** WHO ATC code, e.g. "C10AA05". Empty when there is no single one. */
    atcCode: string;
    /** Salt and presentation, e.g. "calcium trihydrate · 20 mg f/c tab". */
    formAndStrength: string;
    drugClass: string;
    mechanism: string;
    pharmacokinetics: string;
    contraindications: string;
    /** Short labels, not sentences: "Strong CYP3A4 inhibitors". */
    majorInteractions: string[];
    monitoring: string;
}

export interface PatientInfo {
  name: string;
  age: string;
  sex: 'Male' | 'Female' | 'Other' | 'Prefer not to say' | '';
  diagnosis: string;
}

export type View =
  | 'home' | 'search' | 'reading' | 'confirm' | 'results'
  | 'sideEffects' | 'myMedications' | 'professional' | 'notFound';

/**
 * Which part of the side effects screen to open at. The result screen's three
 * chips each pick one; they all land on the same screen.
 */
export type DetailSection = 'sideEffects' | 'missedDose' | 'storage';

/** How sure the reader is that it read the right pack. */
export type ReadingConfidence = 'high' | 'medium' | 'low';

/**
 * What the model made of a photo of a pack. Structured rather than a bare name
 * so the app can ask "is this your box?" before looking anything up.
 */
export interface PackReading {
  recognised: boolean;
  readAs: string;
  strengthAndPack: string;
  confidence: ReadingConfidence;
  alternatives: { name: string; detail: string }[];
}

/** Which part of the lookup is currently running, for the reading screen. */
export type ReadingStage = 'reading' | 'matching' | 'writing';
