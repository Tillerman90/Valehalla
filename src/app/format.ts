import { DAY, HOUR, MINUTE, SECOND } from '../engine';

export function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / SECOND));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function amount(value: number): string {
  const n = Math.floor(value);
  if (n >= 100000) return `${Math.round(n / 1000)}k`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('en-US');
}

export function clockTime(wallMs: number): string {
  return new Date(wallMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dateTime(wallMs: number): string {
  return new Date(wallMs).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ago(wallMs: number, now: number): string {
  const gap = now - wallMs;
  if (gap < 5 * SECOND) return 'just now';
  if (gap < MINUTE) return `${Math.floor(gap / SECOND)}s ago`;
  if (gap < HOUR) return `${Math.floor(gap / MINUTE)}m ago`;
  if (gap < DAY) return `${Math.floor(gap / HOUR)}h ago`;
  return dateTime(wallMs);
}

/** Game time shown as a day count and a time of day since the founding. */
export function worldAge(gameTime: number): string {
  const day = Math.floor(gameTime / DAY) + 1;
  const h = Math.floor((gameTime % DAY) / HOUR);
  const m = Math.floor((gameTime % HOUR) / MINUTE);
  return `Day ${day}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
