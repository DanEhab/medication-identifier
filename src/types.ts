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

export interface NotAMedicationResult {
  recognition: Exclude<Recognition, 'medication'>;
  query: string;
  identifiedAs: string;
  safetyNote: string;
}

export interface DrugInfo {
  drugName: string;
  strength: string;
  commonUse: string;
  dosageAdministration: string;
  foodDrinkEffect: string;
  missedDose: string;
  commonSideEffects: string[];
  seriousSideEffects: string[];
  consultDoctorWhen: string[];
  storage: string;
}

export interface ProfessionalDrugInfo {
    chemistry: any;  // Can be string or object with nested properties
    bcsClass: string;
    pharmacology: any;  // Can be string or object with nested properties
    pharmacokinetics: any;  // Can be string or object with nested properties
    mechanismOfAction: string;
    adverseEffects: any;  // Can be string or object with nested properties
    drugInteractions: any;  // Can be string or object with nested properties
    references: string[] | string;  // Can be array of strings or single string
}

export interface PatientInfo {
  name: string;
  age: string;
  sex: 'Male' | 'Female' | 'Other' | 'Prefer not to say' | '';
  diagnosis: string;
}

export type View = 'home' | 'results' | 'myMedications' | 'professional' | 'notFound';