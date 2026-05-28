import { api } from "./client";

export interface BoardStatsResponse {
  stats: {
    members: number;
    papers: number;
    papers_top_tier: number;
    competitions: number;
    competitions_won: number;
    awards: number;
    active_projects: number;
    open_tasks: number;
  };
  recent_papers: Array<{
    paper_id: number;
    title: string;
    venue: string;
    venue_level: string | null;
    year: number;
    publish_date: string | null;
    status: string;
  }>;
  recent_projects: Array<{
    project_id: number;
    name: string;
    status: string;
    priority: string;
    owner_open_id: string;
    updated_at: string | null;
  }>;
  recent_tasks: Array<{
    task_id: number;
    title: string;
    status: string;
    assignee_open_id: string | null;
    due_date: string | null;
    priority: string;
  }>;
}

export const getBoardStats = async (): Promise<BoardStatsResponse> => {
  const { data } = await api.get<BoardStatsResponse>("/stats/board");
  return data;
};
