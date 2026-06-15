import { listHistoryKeys, loadHistory } from "../../utils/activityHistory";

interface DayPoint {
  date: string; // YYYY-MM-DD, server-local
  seconds: number;
}

/** Server-local YYYY-MM-DD for an ISO timestamp. Buckets by local day so a
 *  scan and the play it captured land on the same calendar day. */
function localDay(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Server-local YYYY-MM-DD `offset` days before today (0 = today). */
function dayKeyAgo(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const reqDays = Number(q.days);
  const days = Number.isFinite(reqDays) ? Math.min(90, Math.max(1, Math.trunc(reqDays))) : 14;

  const keys = await listHistoryKeys();

  // Sum playtime deltas across all sources, keyed by local day.
  const dailyDelta = new Map<string, number>();
  let multiSnapshotSources = 0;

  for (const key of keys) {
    const snaps = await loadHistory(key);
    if (snaps.length >= 2) multiSnapshotSources++;
    if (snaps.length === 0) continue;

    // Cumulative runtime is monotonic, so the last snapshot of a day carries that
    // day's running total. Collapse to one total per local day.
    const totalByDay = new Map<string, number>();
    for (const s of snaps) {
      const day = localDay(s.at);
      if (!day) continue;
      // snaps are oldest→newest, so later writes overwrite earlier same-day ones
      totalByDay.set(day, s.totalSeconds);
    }

    // Delta of each observed day vs the prior observed day → playtime in that gap,
    // attributed to the later day. Clamp negative (cache reset / source swap) to 0.
    const observed = [...totalByDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let prevTotal: number | null = null;
    for (const [day, total] of observed) {
      if (prevTotal !== null) {
        const delta = Math.max(0, total - prevTotal);
        dailyDelta.set(day, (dailyDelta.get(day) ?? 0) + delta);
      }
      prevTotal = total;
    }
  }

  // Build the zero-filled window, oldest→newest.
  const series: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKeyAgo(i);
    series.push({ date, seconds: dailyDelta.get(date) ?? 0 });
  }

  const weekSeconds = series.slice(-7).reduce((s, p) => s + p.seconds, 0);

  // Streak: consecutive days up to and including today with any playtime.
  let streakDays = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].seconds > 0) streakDays++;
    else break;
  }

  return {
    days: series,
    weekSeconds,
    streakDays,
    haveHistory: multiSnapshotSources > 0,
  };
});
