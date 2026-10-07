export interface AuditEntry {
  id: number;
  timestamp: string;
  action: string;
  action_label: string;
  entity_type: string;
  entity_id: number | null;
  user: { id: number; name: string | null } | null;
  /** `name` is null when the project has since been deleted. */
  project: { id: number; name: string | null } | null;
  finding: { id: number; title: string | null } | null;
  details: Record<string, unknown> | null;
}

export interface AuditActionOption {
  code: string;
  label: string;
}

export interface AuditQuery {
  page?: number;
  page_size?: number;
  user_id?: number;
  action?: string;
  project_id?: number;
  date_from?: string;
  date_to?: string;
}
