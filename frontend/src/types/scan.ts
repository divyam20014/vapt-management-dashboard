import type { ScanStatus } from '../utils/constants';

export interface Scan {
  id: number;
  project_id: number;
  project_name: string;
  scan_name: string;
  scanner: string | null;
  report_type: string | null;
  original_filename: string;
  scan_date: string | null;
  uploaded_at: string;
  processing_status: ScanStatus;
  total_findings: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  informational_count: number;
  processing_error: string | null;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  unclassified: number;
}

export interface PotentialDuplicate {
  finding_id: number;
  finding_title: string;
  finding_source: string;
  candidate_finding_id: number;
  candidate_title: string;
  candidate_source: string;
  endpoint: string | null;
  reason: string;
  confidence: 'Medium' | 'Low';
}

export interface UploadResult {
  scan: Scan;
  parser: string;
  records_parsed: number;
  new_findings: number;
  existing_findings: number;
  severity_counts: SeverityCounts;
  potential_duplicates: PotentialDuplicate[];
  warnings: string[];
}

export interface UploadInput {
  projectId: number;
  file: File;
  scanName?: string;
  scanDate?: string;
  allowDuplicate?: boolean;
}
