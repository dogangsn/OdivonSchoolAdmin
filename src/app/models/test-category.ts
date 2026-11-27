export type EducationLevel = 'ilkokul' | 'ortaokul' | 'lise' | 'kpss';

export interface LearningOutcome { code: string; text: string; }

export interface TestCategory {
  id: string;
  level: EducationLevel;
  subject: string;      // e.g. "Matematik", "Türkçe", "Genel Yetenek"
  topic: string;        // e.g. "Kesirler", "Paragraf" or a MEB tema name
  description?: string;
  order: number;
  /** Grades (1-12) this category is taught in. Missing = all grades of the level (and KPSS). */
  grades?: number[];
  /** Learning outcomes from the MEB Türkiye Yüzyılı Maarif Modeli program, when known. */
  outcomes?: LearningOutcome[];
  /** Link to the official MEB program page the category was built from. */
  sourceUrl?: string;
}

export const LEVEL_LABELS: Record<EducationLevel, string> = {
  ilkokul: 'İlkokul',
  ortaokul: 'Ortaokul',
  lise: 'Lise',
  kpss: 'KPSS',
};
