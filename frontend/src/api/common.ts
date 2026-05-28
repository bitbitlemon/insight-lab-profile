export interface PointsSummaryEntry {
  member_open_id: string;
  member_name?: string | null;
  base_points: number;
  share_ratio: number;
  decay_factor: number;
  cap_adjustment_factor: number;
  final_points: number;
  reason?: string | null;
}

export interface PointsSummary {
  total_final_points: number;
  my_final_points: number;
  member_count: number;
  entries?: PointsSummaryEntry[];
}
