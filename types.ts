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
    chemistry: string;
    bcsClass: string;
    pharmacology: string;
    pharmacokinetics: string;
    mechanismOfAction: string;
    adverseEffects: string;
    drugInteractions: string;
    references: string;
}

export interface PatientInfo {
  name: string;
  age: string;
  sex: 'Male' | 'Female' | 'Other' | 'Prefer not to say' | '';
  diagnosis: string;
}

export type View = 'home' | 'results' | 'myMedications' | 'professional';