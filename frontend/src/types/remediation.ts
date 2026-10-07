export interface GuidelineSummary {
  slug: string;
  title: string;
  category: string;
  owasp: string | null;
  summary: string;
  cwe_ids: string[];
  /** Stored findings this guideline applies to (exact scanner rule or CWE), and how many are active. */
  findings: number;
  active_findings: number;
}

export interface GuidelineDetail extends GuidelineSummary {
  steps: string[];
  verification: string | null;
  references: { title: string; url: string }[];
  zap_rules: string[];
  nuclei_rules: string[];
}

export interface RemediationLibrary {
  items: GuidelineSummary[];
  categories: string[];
  total: number;
}

/** A guideline linked to a finding. Application guidance, never part of the scanner report. */
export interface StandardGuidanceRef {
  slug: string;
  title: string;
  category: string;
  summary: string;
  match_type: 'scanner_rule' | 'cwe';
  basis: string;
}
