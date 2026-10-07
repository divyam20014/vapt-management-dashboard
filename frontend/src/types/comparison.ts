import type { FindingListItem } from './finding';
import type { Scan } from './scan';

export type Classification = 'New' | 'Resolved' | 'Persistent' | 'Reopened';

export interface ComparisonItem {
  classification: Classification;
  finding: FindingListItem;
  reason: string;
  base_observations: number;
  compare_observations: number;
  last_seen_before_base: { id: number; scan_name: string; scan_time: string } | null;
  renamed_from: { id: number; title: string } | null;
  attention: string | null;
}

export interface ComparisonResult {
  project_id: number;
  project_name: string;
  base: Scan;
  compare: Scan;
  reordered: boolean;
  warnings: string[];
  counts: { new: number; resolved: number; persistent: number; reopened: number };
  items: ComparisonItem[];
}
