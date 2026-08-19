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

export type View = 'home' | 'results' | 'myMedications' | 'professional';