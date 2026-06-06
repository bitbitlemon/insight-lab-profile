import { api } from "./client";
import type { Page } from "../types/api";

export type EventType = "meeting" | "class" | "leave" | "personal" | "lab" | "other";
export type LeaveType = "sick" | "personal" | "annual" | "business" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface CalendarEvent {
  event_id: number;
  lark_event_id: string | null;
  event_type: EventType;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  organizer_open_id: string;
  attendees_json: string | null;
  sync_status: "local" | "synced" | "sync_failed" | "pulled";
  lark_synced_at: string | null;
  related_project_id: number | null;
  created_at: string;
}

export interface ClassSchedule {
  schedule_id: number;
  member_open_id: string;
  course_name: string;
  teacher: string | null;
  location: string | null;
  semester: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  week_pattern: string | null;
  semester_start: string | null;
  semester_end: string | null;
  notes: string | null;
}

export interface LeaveRequest {
  leave_id: number;
  member_open_id: string;
  leave_type: LeaveType;
  start_at: string;
  end_at: string;
  reason: string | null;
  status: LeaveStatus;
  approved_by: string | null;
  approved_at: string | null;
  review_comment: string | null;
  lark_event_id: string | null;
  created_at: string;
}

export interface BusySlot {
  member_open_id: string;
  start_at: string;
  end_at: string;
  kind: "event" | "class" | "leave";
  title: string;
}

export interface FreeBusyResponse {
  members: string[];
  range_start: string;
  range_end: string;
  busy: BusySlot[];
}

export interface LarkUserStatus {
  member_open_id: string;
  status_id?: string | null;
  status_type?: string | null;
  title?: string | null;
  emoji_key?: string | null;
  emoji_path?: string | null;
  presence_status?: "auto" | "working" | "focusing" | "resting" | "classroom" | "meeting_room" | "away" | null;
  is_active: boolean;
  start_at?: string | null;
  end_at?: string | null;
  updated_at: string;
}

export interface CreateCalendarEventPayload {
  event_type: EventType;
  title: string;
  description?: string | null;
  location?: string | null;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  attendee_open_ids?: string[];
  related_project_id?: number | null;
  sync_to_lark?: boolean;
}

export interface CreateClassSchedulePayload {
  member_open_id: string;
  course_name: string;
  teacher?: string | null;
  location?: string | null;
  semester: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  week_pattern?: string | null;
  semester_start?: string | null;
  semester_end?: string | null;
  notes?: string | null;
}

export interface CreateLeaveRequestPayload {
  leave_type: LeaveType;
  start_at: string;
  end_at: string;
  reason?: string | null;
}

export const listCalendarEvents = async (params: {
  start?: string;
  end?: string;
  member_open_id?: string;
  event_type?: EventType;
  related_project_id?: number;
  page?: number;
  page_size?: number;
}): Promise<Page<CalendarEvent>> => {
  const { data } = await api.get<Page<CalendarEvent>>("/calendar/events", { params });
  return data;
};

export const createCalendarEvent = async (payload: CreateCalendarEventPayload): Promise<CalendarEvent> => {
  const { data } = await api.post<CalendarEvent>("/calendar/events", payload);
  return data;
};

export const syncLarkCalendarEvents = async (payload: {
  calendar_id: string;
  start?: string;
  end?: string;
}): Promise<{ calendar_id: string; fetched: number; created: number; updated: number; skipped: number }> => {
  const { data } = await api.post("/calendar/events/sync-lark", payload);
  return data;
};

export const syncOrgPublicCalendarEvents = async (payload: {
  start?: string;
  end?: string;
}): Promise<{ calendar_id: string; calendar_name?: string; fetched: number; created: number; updated: number; skipped: number }> => {
  const { data } = await api.post("/calendar/events/sync-org-public", payload);
  return data;
};

export const deleteCalendarEvent = async (eventId: number): Promise<void> => {
  await api.delete(`/calendar/events/${eventId}`);
};

export interface UpdateCalendarEventPayload {
  title?: string;
  description?: string | null;
  location?: string | null;
  start_at?: string;
  end_at?: string;
  event_type?: EventType;
}

export const updateCalendarEvent = async (
  eventId: number,
  payload: UpdateCalendarEventPayload,
): Promise<CalendarEvent> => {
  const { data } = await api.patch<CalendarEvent>(`/calendar/events/${eventId}`, payload);
  return data;
};

export const listClassSchedules = async (params: {
  member_open_id?: string;
  member_open_ids?: string[];
  semester?: string;
}): Promise<ClassSchedule[]> => {
  const { data } = await api.get<ClassSchedule[]>("/calendar/classes", {
    params: {
      ...params,
      member_open_ids: params.member_open_ids?.join(","),
    },
  });
  return data;
};

export const createClassSchedule = async (payload: CreateClassSchedulePayload): Promise<ClassSchedule> => {
  const { data } = await api.post<ClassSchedule>("/calendar/classes", payload);
  return data;
};

export const bulkCreateClassSchedules = async (payload: {
  items: CreateClassSchedulePayload[];
}): Promise<ClassSchedule[]> => {
  const { data } = await api.post<ClassSchedule[]>("/calendar/classes/bulk", payload);
  return data;
};

export const deleteClassSchedule = async (scheduleId: number): Promise<void> => {
  await api.delete(`/calendar/classes/${scheduleId}`);
};

export const listLeaveRequests = async (params: {
  member_open_id?: string;
  status?: LeaveStatus;
  page?: number;
  page_size?: number;
}): Promise<Page<LeaveRequest>> => {
  const { data } = await api.get<Page<LeaveRequest>>("/calendar/leaves", { params });
  return data;
};

export const createLeaveRequest = async (payload: CreateLeaveRequestPayload): Promise<LeaveRequest> => {
  const { data } = await api.post<LeaveRequest>("/calendar/leaves", payload);
  return data;
};

export const reviewLeaveRequest = async (
  leaveId: number,
  payload: { approve: boolean; comment?: string },
): Promise<LeaveRequest> => {
  const { data } = await api.patch<LeaveRequest>(`/calendar/leaves/${leaveId}`, payload);
  return data;
};

export const getFreeBusy = async (params: {
  member_ids: string[];
  start: string;
  end: string;
}): Promise<FreeBusyResponse> => {
  const { data } = await api.get<FreeBusyResponse>("/calendar/freebusy", {
    params: {
      member_ids: params.member_ids.join(","),
      start: params.start,
      end: params.end,
    },
  });
  return data;
};

export const listLarkUserStatuses = async (params?: {
  member_open_ids?: string[];
}): Promise<LarkUserStatus[]> => {
  const { data } = await api.get<LarkUserStatus[]>("/calendar/lark-statuses", {
    params: {
      member_open_ids: params?.member_open_ids?.join(","),
    },
  });
  return data;
};

export const setLarkUserStatus = async (
  memberOpenId: string,
  status: NonNullable<LarkUserStatus["presence_status"]>,
): Promise<LarkUserStatus | null> => {
  const { data } = await api.post<LarkUserStatus | null>(`/calendar/lark-statuses/${memberOpenId}`, { status });
  return data;
};
