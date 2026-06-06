import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Dialog, Toast } from "antd-mobile";
import {
  deleteCalendarEvent,
  listCalendarEvents,
  syncLarkCalendarEvents,
  syncOrgPublicCalendarEvents,
  updateCalendarEvent,
  type CalendarEvent,
  type EventType,
} from "../api/calendar";
import MeetingFormPopup from "../components/MeetingFormPopup";
import { PageShell, colors, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";

const HOUR_START = 7;
const HOUR_END = 23;
const HOUR_COUNT = HOUR_END - HOUR_START;
const ROW_HEIGHT = 52;
const TIME_COL_WIDTH = 48;
const TIME_COL_WIDTH_MOBILE = 36;
const SNAP_MIN = 15;
const MOBILE_BREAKPOINT = 520;

const calendarStyles = `
  .cal-slot {
    transition: background 120ms ease;
    position: relative;
  }
  .cal-slot:hover {
    background: #f1f5f9;
  }
  .cal-slot:hover::after {
    content: "+";
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(99,102,241,0.45);
    font-size: 18px;
    font-weight: 300;
    pointer-events: none;
  }
  .cal-event {
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .cal-event.dragging {
    cursor: grabbing !important;
    transform: scale(1.02);
    box-shadow: 0 6px 18px rgba(15,23,42,0.22) !important;
  }
  @media (max-width: ${MOBILE_BREAKPOINT}px) {
    .cal-time-col { width: ${TIME_COL_WIDTH_MOBILE}px !important; }
    .cal-time-label { font-size: 9px !important; padding-right: 4px !important; }
    .cal-day-header-name { font-size: 10px !important; }
    .cal-day-header-date { font-size: 13px !important; }
    .cal-event { padding: 2px 5px !important; font-size: 10px !important; }
  }
`;

const EVENT_COLOR: Record<EventType, { bg: string; border: string; fg: string }> = {
  meeting: { bg: "#dbeafe", border: "#3b82f6", fg: "#1e3a8a" },
  class: { bg: "#fef3c7", border: "#f59e0b", fg: "#7c2d12" },
  leave: { bg: "#fee2e2", border: "#ef4444", fg: "#7f1d1d" },
  personal: { bg: "#dcfce7", border: "#10b981", fg: "#064e3b" },
  lab: { bg: "#ede9fe", border: "#7c3aed", fg: "#3b0764" },
  other: { bg: "#e5e7eb", border: "#6b7280", fg: "#1f2937" },
};

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  meeting: "会议",
  class: "课程",
  leave: "请假",
  personal: "个人",
  lab: "实验室",
  other: "其他",
};

const startOfWeek = (d: Date): Date => {
  const out = new Date(d);
  const dow = out.getDay();
  const diff = (dow + 6) % 7;
  out.setDate(out.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
};

const addDays = (d: Date, n: number): Date => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

const fmtTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const fmtMonthDay = (d: Date): string => `${d.getMonth() + 1}/${d.getDate()}`;

const dateInputValue = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const weekLabel = (start: Date): string => {
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getFullYear()}年 ${start.getMonth() + 1} 月 ${start.getDate()}–${end.getDate()} 日`;
  }
  return `${start.getFullYear()}年 ${start.getMonth() + 1}/${start.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`;
};

const minutesSinceDayStart = (d: Date): number => d.getHours() * 60 + d.getMinutes();

const eventTopPx = (start: Date): number => {
  const m = minutesSinceDayStart(start) - HOUR_START * 60;
  return Math.max(0, (m / 60) * ROW_HEIGHT);
};

const eventHeightPx = (start: Date, end: Date): number => {
  const ms = end.getTime() - start.getTime();
  const minutes = Math.max(15, ms / 60000);
  return Math.max(18, (minutes / 60) * ROW_HEIGHT);
};

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

interface DragState {
  eventId: number;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originStart: Date;
  originEnd: Date;
  deltaMinutes: number;
  deltaDays: number;
}

interface WeekCacheEntry {
  items: CalendarEvent[];
}

const CalendarPage = () => {
  const { me } = useAuth();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const weekCacheRef = useRef<Map<string, WeekCacheEntry>>(new Map());
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [colWidth, setColWidth] = useState(120);
  const [meetingPopupVisible, setMeetingPopupVisible] = useState(false);
  const [meetingInitialDate, setMeetingInitialDate] = useState<Date | undefined>(undefined);
  const [larkCalendarDraft, setLarkCalendarDraft] = useState(() => {
    const start = startOfWeek(new Date());
    return { calendarId: "", start: dateInputValue(start), end: dateInputValue(addDays(start, 7)) };
  });
  const [syncingLarkCalendar, setSyncingLarkCalendar] = useState(false);
  const [syncingOrgCalendar, setSyncingOrgCalendar] = useState(false);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const loadEvents = useCallback(async () => {
    const cacheKey = weekStart.toISOString();
    const cached = weekCacheRef.current.get(cacheKey);
    if (cached) {
      setEvents(cached.items);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const start = new Date(weekStart);
      const end = addDays(weekStart, 7);
      const res = await listCalendarEvents({
        start: start.toISOString(),
        end: end.toISOString(),
        page: 1,
        page_size: 300,
      });
      setEvents(res.items);
      weekCacheRef.current.set(cacheKey, { items: res.items });
    } catch {
      Toast.show({ content: "加载日程失败" });
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  const refreshEvents = useCallback(async () => {
    weekCacheRef.current.delete(weekStart.toISOString());
    await loadEvents();
  }, [loadEvents, weekStart]);

  const syncSubscribedLarkCalendar = useCallback(async () => {
    const calendarId = larkCalendarDraft.calendarId.trim();
    if (!calendarId) {
      Toast.show({ content: "请填写飞书日历 ID" });
      return;
    }
    setSyncingLarkCalendar(true);
    try {
      const result = await syncLarkCalendarEvents({
        calendar_id: calendarId,
        start: larkCalendarDraft.start ? new Date(larkCalendarDraft.start).toISOString() : undefined,
        end: larkCalendarDraft.end ? new Date(larkCalendarDraft.end).toISOString() : undefined,
      });
      weekCacheRef.current.clear();
      await loadEvents();
      Toast.show({ content: `同步完成：${result.fetched} 条日程` });
    } catch {
      Toast.show({ content: "飞书日历同步失败" });
    } finally {
      setSyncingLarkCalendar(false);
    }
  }, [larkCalendarDraft, loadEvents]);

  const syncOrgPublicCalendar = useCallback(async () => {
    setSyncingOrgCalendar(true);
    try {
      const result = await syncOrgPublicCalendarEvents({
        start: larkCalendarDraft.start ? new Date(larkCalendarDraft.start).toISOString() : undefined,
        end: larkCalendarDraft.end ? new Date(larkCalendarDraft.end).toISOString() : undefined,
      });
      weekCacheRef.current.clear();
      await loadEvents();
      Toast.show({ content: `公共日历同步完成：${result.fetched} 条日程` });
    } catch {
      Toast.show({ content: "公共日历同步失败" });
    } finally {
      setSyncingOrgCalendar(false);
    }
  }, [larkCalendarDraft.end, larkCalendarDraft.start, loadEvents]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const measure = () => {
      if (!gridRef.current) return;
      const w = gridRef.current.getBoundingClientRect().width - TIME_COL_WIDTH;
      setColWidth((prev) => {
        const next = w / 7;
        return Math.abs(prev - next) < 1 ? prev : next;
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    void import("../components/MeetingFormBody");
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      void refreshEvents();
    };
    window.addEventListener("calendar:refresh", handleRefresh);
    return () => window.removeEventListener("calendar:refresh", handleRefresh);
  }, [refreshEvents]);

  useEffect(
    () => () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
      }
    },
    [],
  );

  const goPrevWeek = () => setWeekStart((d) => addDays(d, -7));
  const goNextWeek = () => setWeekStart((d) => addDays(d, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date()));

  const canEdit = (ev: CalendarEvent) =>
    Boolean(me && (me.role === "admin" || me.role === "staff" || ev.organizer_open_id === me.open_id));

  const onPointerDownEvent = (e: ReactPointerEvent<HTMLDivElement>, ev: CalendarEvent) => {
    if (!canEdit(ev)) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const nextDrag = {
      eventId: ev.event_id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originStart: new Date(ev.start_at),
      originEnd: new Date(ev.end_at),
      deltaMinutes: 0,
      deltaDays: 0,
    };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const currentDrag = dragRef.current;
    if (!currentDrag || e.pointerId !== currentDrag.pointerId) return;
    const dx = e.clientX - currentDrag.startClientX;
    const dy = e.clientY - currentDrag.startClientY;
    const ddays = colWidth > 0 ? Math.round(dx / colWidth) : 0;
    const dminutes = Math.round((dy / ROW_HEIGHT) * 60 / SNAP_MIN) * SNAP_MIN;
    if (ddays !== currentDrag.deltaDays || dminutes !== currentDrag.deltaMinutes) {
      const nextDrag = { ...currentDrag, deltaDays: ddays, deltaMinutes: dminutes };
      dragRef.current = nextDrag;
      if (dragRafRef.current !== null) {
        return;
      }
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null;
        if (dragRef.current) {
          setDrag(dragRef.current);
        }
      });
    }
  };

  const onPointerUp = async (e: ReactPointerEvent<HTMLDivElement>) => {
    const currentDrag = dragRef.current;
    if (!currentDrag || e.pointerId !== currentDrag.pointerId) return;
    const captured = currentDrag;
    dragRef.current = null;
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    setDrag(null);
    if (captured.deltaDays === 0 && captured.deltaMinutes === 0) return;
    const newStart = new Date(captured.originStart.getTime());
    newStart.setDate(newStart.getDate() + captured.deltaDays);
    newStart.setMinutes(newStart.getMinutes() + captured.deltaMinutes);
    const newEnd = new Date(captured.originEnd.getTime());
    newEnd.setDate(newEnd.getDate() + captured.deltaDays);
    newEnd.setMinutes(newEnd.getMinutes() + captured.deltaMinutes);
    try {
      const updated = await updateCalendarEvent(captured.eventId, {
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
      });
      setEvents((prev) => {
        const next = prev.map((p) => (p.event_id === updated.event_id ? updated : p));
        weekCacheRef.current.set(weekStart.toISOString(), { items: next });
        return next;
      });
      Toast.show({ content: "已更新时间" });
    } catch {
      Toast.show({ content: "更新失败" });
      void loadEvents();
    }
  };

  const onEventClick = (ev: CalendarEvent) => {
    if (drag) return;
    Dialog.confirm({
      title: ev.title,
      content: (
        <div style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7 }}>
          <div>类型: {EVENT_TYPE_LABEL[ev.event_type]}</div>
          <div>开始: {new Date(ev.start_at).toLocaleString("zh-CN")}</div>
          <div>结束: {new Date(ev.end_at).toLocaleString("zh-CN")}</div>
          {ev.location ? <div>地点: {ev.location}</div> : null}
          {ev.description ? <div>说明: {ev.description}</div> : null}
        </div>
      ),
      confirmText: canEdit(ev) ? "删除" : "关闭",
      cancelText: "取消",
      onConfirm: async () => {
        if (!canEdit(ev)) return;
        try {
          await deleteCalendarEvent(ev.event_id);
          setEvents((prev) => {
            const next = prev.filter((p) => p.event_id !== ev.event_id);
            weekCacheRef.current.set(weekStart.toISOString(), { items: next });
            return next;
          });
          Toast.show({ content: "已删除" });
        } catch {
          Toast.show({ content: "删除失败" });
        }
      },
    });
  };

  const onSlotClick = (day: Date, hour: number) => {
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    setMeetingInitialDate(start);
    setMeetingPopupVisible(true);
  };

  const handleMeetingCreated = async () => {
    setMeetingPopupVisible(false);
    setMeetingInitialDate(undefined);
    await refreshEvents();
  };

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (let i = 0; i < 7; i++) {
      map[days[i].toDateString()] = [];
    }
    for (const ev of events) {
      const s = new Date(ev.start_at);
      for (let i = 0; i < 7; i++) {
        if (sameDay(s, days[i])) {
          map[days[i].toDateString()].push(ev);
          break;
        }
      }
    }
    return map;
  }, [days, events]);

  const todayStr = new Date().toDateString();

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  };

  const dayHeaderStyle = (d: Date): CSSProperties => {
    const isToday = d.toDateString() === todayStr;
    return {
      flex: 1,
      textAlign: "center",
      padding: "6px 2px",
      fontSize: 12,
      fontWeight: 600,
      color: isToday ? "#ffffff" : colors.title,
      background: isToday ? colors.primary : "transparent",
      borderRadius: isToday ? 10 : 0,
      margin: "4px 2px",
      boxShadow: isToday ? "0 2px 6px rgba(99,102,241,0.25)" : "none",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 1,
    };
  };

  return (
    <PageShell>
      <style>{calendarStyles}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: colors.title }}>日历</div>
            <div style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{weekLabel(weekStart)}</div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <Button size="mini" fill="outline" onClick={goPrevWeek} style={{ "--height": "28px" } as CSSProperties}>‹</Button>
            <Button size="mini" fill="outline" onClick={goToday} style={{ "--height": "28px" } as CSSProperties}>今天</Button>
            <Button size="mini" fill="outline" onClick={goNextWeek} style={{ "--height": "28px" } as CSSProperties}>›</Button>
            <Button
              size="mini"
              color="primary"
              onClick={() => {
                setMeetingInitialDate(undefined);
                setMeetingPopupVisible(true);
              }}
              style={{ "--height": "28px" } as CSSProperties}
            >
              新建
            </Button>
          </div>
        </div>

        <div style={{ ...sectionCardStyle, padding: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: colors.title }}>飞书订阅日历同步</div>
              <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>把指定飞书日历里的会议日程同步到系统日历。</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 6, alignItems: "end", flex: "1 1 720px" }}>
              <label style={{ display: "grid", gap: 3, fontSize: 11, color: colors.muted }}>
                日历 ID
                <input
                  value={larkCalendarDraft.calendarId}
                  placeholder="可选：其他飞书日历 ID"
                  onChange={(event) => setLarkCalendarDraft((prev) => ({ ...prev, calendarId: event.target.value }))}
                  style={{ height: 30, border: "1px solid #d1d5db", borderRadius: 6, padding: "0 8px", fontSize: 12 }}
                />
              </label>
              <label style={{ display: "grid", gap: 3, fontSize: 11, color: colors.muted }}>
                开始
                <input
                  type="date"
                  value={larkCalendarDraft.start}
                  onChange={(event) => setLarkCalendarDraft((prev) => ({ ...prev, start: event.target.value }))}
                  style={{ height: 30, border: "1px solid #d1d5db", borderRadius: 6, padding: "0 8px", fontSize: 12 }}
                />
              </label>
              <label style={{ display: "grid", gap: 3, fontSize: 11, color: colors.muted }}>
                结束
                <input
                  type="date"
                  value={larkCalendarDraft.end}
                  onChange={(event) => setLarkCalendarDraft((prev) => ({ ...prev, end: event.target.value }))}
                  style={{ height: 30, border: "1px solid #d1d5db", borderRadius: 6, padding: "0 8px", fontSize: 12 }}
                />
              </label>
              <Button
                size="mini"
                color="primary"
                fill="outline"
                loading={syncingOrgCalendar}
                onClick={() => void syncOrgPublicCalendar()}
                style={{ "--height": "30px" } as CSSProperties}
              >
                同步公共日历
              </Button>
              <Button
                size="mini"
                color="primary"
                loading={syncingLarkCalendar}
                onClick={() => void syncSubscribedLarkCalendar()}
                style={{ "--height": "30px" } as CSSProperties}
              >
                同步指定日历
              </Button>
            </div>
          </div>
        </div>

        <div style={{ ...sectionCardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: "1px solid rgba(226,232,240,0.9)" }}>
            <div style={{ width: TIME_COL_WIDTH, flexShrink: 0 }} />
            {days.map((d) => (
              <div key={d.toDateString()} style={dayHeaderStyle(d)}>
                <div className="cal-day-header-name" style={{ fontSize: 11, opacity: 0.85 }}>
                  {["周一", "周二", "周三", "周四", "周五", "周六", "周日"][d.getDay() === 0 ? 6 : d.getDay() - 1]}
                </div>
                <div className="cal-day-header-date" style={{ fontSize: 15, fontWeight: 800, marginTop: 1 }}>{fmtMonthDay(d)}</div>
              </div>
            ))}
          </div>

          <div
            ref={gridRef}
            style={{
              position: "relative",
              display: "flex",
              touchAction: drag ? "none" : "auto",
              userSelect: "none",
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="cal-time-col" style={{ width: TIME_COL_WIDTH, flexShrink: 0, borderRight: "1px solid rgba(226,232,240,0.9)" }}>
              {Array.from({ length: HOUR_COUNT }).map((_, i) => (
                <div
                  key={i}
                  className="cal-time-label"
                  style={{
                    height: ROW_HEIGHT,
                    fontSize: 10,
                    color: "#94a3b8",
                    textAlign: "right",
                    paddingRight: 6,
                    paddingTop: 2,
                    boxSizing: "border-box",
                    letterSpacing: "0.02em",
                  }}
                >
                  {String(HOUR_START + i).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {days.map((d) => {
              const dayEvents = eventsByDay[d.toDateString()] || [];
              return (
                <div
                  key={d.toDateString()}
                  style={{
                    flex: 1,
                    position: "relative",
                    borderRight: "1px solid rgba(241,245,249,0.9)",
                    minHeight: HOUR_COUNT * ROW_HEIGHT,
                  }}
                >
                  {Array.from({ length: HOUR_COUNT }).map((_, i) => (
                    <div
                      key={i}
                      className="cal-slot"
                      onClick={() => onSlotClick(d, HOUR_START + i)}
                      style={{
                        height: ROW_HEIGHT,
                        borderBottom: "1px dashed rgba(241,245,249,0.9)",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                  {dayEvents.map((ev) => {
                    const s = new Date(ev.start_at);
                    const e = new Date(ev.end_at);
                    const isDragging = drag?.eventId === ev.event_id;
                    const top = eventTopPx(s) + (isDragging ? (drag!.deltaMinutes / 60) * ROW_HEIGHT : 0);
                    const left = isDragging ? drag!.deltaDays * colWidth : 0;
                    const height = eventHeightPx(s, e);
                    const c = EVENT_COLOR[ev.event_type] || EVENT_COLOR.other;
                    return (
                      <div
                        key={ev.event_id}
                        className={`cal-event${isDragging ? " dragging" : ""}`}
                        onPointerDown={(pe) => onPointerDownEvent(pe, ev)}
                        onClick={(ce) => {
                          ce.stopPropagation();
                          if (!isDragging && !drag) onEventClick(ev);
                        }}
                        style={{
                          position: "absolute",
                          top,
                          left: `calc(${left}px + 2px)`,
                          right: 2,
                          height,
                          background: c.bg,
                          borderLeft: `3px solid ${c.border}`,
                          color: c.fg,
                          borderRadius: 6,
                          padding: "3px 6px",
                          fontSize: 11,
                          lineHeight: 1.3,
                          overflow: "hidden",
                          cursor: canEdit(ev) ? "grab" : "pointer",
                          opacity: isDragging ? 0.92 : 1,
                          zIndex: isDragging ? 30 : 1,
                          touchAction: "none",
                        }}
                      >
                        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {ev.title}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.85 }}>
                          {fmtTime(s)}–{fmtTime(e)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: colors.muted, fontSize: 12 }}>加载中...</div>
        ) : null}

        <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.6, paddingBottom: 12 }}>
          提示: 长按或鼠标拖拽事件块可改时间; 点击空白时段新建会议; 点击事件查看详情或删除。
        </div>
      </div>

      <MeetingFormPopup
        visible={meetingPopupVisible}
        initialDate={meetingInitialDate}
        onClose={() => {
          setMeetingPopupVisible(false);
          setMeetingInitialDate(undefined);
        }}
        onSuccess={() => {
          void handleMeetingCreated();
        }}
      />
    </PageShell>
  );
};

export default CalendarPage;
