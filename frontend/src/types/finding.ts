import type { FindingStatus, Severity } from '../utils/constants';
import type { UserRef } from './user';

export interface FindingListItem {
  id: number;
  project_id: number;
  project_name: string;
  normalized_title: string;
  original_title: string;
  normalized_severity: Severity | null;
  original_severity: string | null;
  category: string | null;
  endpoint: string | null;
  affected_url: string | null;
  parameter: string | null;
  http_method: string | null;
  source_tool: string;
  source_template: string | null;
  cwe: string | null;
  status: FindingStatus;
  assignee: UserRef | null;
  first_detected: string;
  last_detected: string;
  occurrence_count: number;
}

export interface Occurrence {
  id: number;
  scan_id: number;
  scan_name: string;
  scanner: string | null;
  report_type: string | null;
  scan_date: string | null;
  uploaded_at: string;
  original_title: string;
  original_severity: string | null;
  affected_url: string | null;
  parameter: string | null;
  http_method: string | null;
  evidence: string | null;
}

export interface OccurrenceRaw {
  id: number;
  scan_id: number;
  original_filename: string;
  raw_record: Record<string, unknown>;
}

export interface StatusHistoryEntry {
  id: number;
  old_status: FindingStatus | null;
  new_status: FindingStatus;
  changed_by: UserRef | null;
  changed_at: string;
  comment: string | null;
}

export interface RelatedDuplicate {
  id: number;
  other_finding_id: number;
  other_title: string;
  other_source: string;
  reason: string;
  confidence: 'Medium' | 'Low';
  decision: string;
}

export interface FindingDetail extends FindingListItem {
  scan_id: number;
  finding_key: string;
  subcategory: string | null;
  description: string | null;
  impact: string | null;
  recommendation: string | null;
  evidence: string | null;
  steps_to_reproduce: string | null;
  source_reference: string | null;
  owasp: string | null;
  cvss_score: number | null;
  source_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  occurrences: Occurrence[];
  status_history: StatusHistoryEntry[];
  potential_duplicates: RelatedDuplicate[];
}

export type FindingSortField =
  | 'severity'
  | 'title'
  | 'status'
  | 'source'
  | 'endpoint'
  | 'project'
  | 'first_detected'
  | 'last_detected'
  | 'updated_at';

export interface FindingQuery {
  page: number;
  page_size: number;
  search?: string;
  project_id?: number[];
  scan_id?: number;
  severity?: string[];
  status?: string[];
  source_tool?: string[];
  category?: string[];
  assignee?: string;
  date_field?: 'first_detected' | 'last_detected';
  date_from?: string;
  date_to?: string;
  sort_by?: FindingSortField;
  sort_order?: 'asc' | 'desc';
}

/** Workflow change. Omit `assigned_to` to leave the assignment unchanged; null unassigns. */
export interface FindingChange {
  status?: FindingStatus;
  assigned_to?: number | null;
  comment?: string;
}

export interface BulkUpdateResult {
  requested: number;
  updated: number;
  unchanged: number;
  updated_ids: number[];
}

export interface FindingFacets {
  source_tools: string[];
  categories: string[];
}
