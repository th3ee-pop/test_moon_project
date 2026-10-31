/**
 * 月相计算：基于朔望月周期，从 2000-01-06 18:14 UTC 的一次新月起算。
 * 精度对学生观察任务足够（误差 < 0.5 天），不依赖任何外部接口。
 */

export const SYNODIC_MONTH = 29.530588853;

/** 2000-01-06T18:14:00Z 的新月时刻 */
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0);
const DAY = 86400000;

export type PhaseKey =
  | "new"
  | "waxing-crescent"
  | "first-quarter"
  | "waxing-gibbous"
  | "full"
  | "waning-gibbous"
  | "last-quarter"
  | "waning-crescent";

export type PhaseName =
  | "新月（朔）"
  | "蛾眉月"
  | "上弦月"
  | "盈凸月"
  | "满月（望）"
  | "亏凸月"
  | "下弦月"
  | "残月";

export type MoonInfo = {
  /** 月龄，0 ~ 29.53 天 */
  age: number;
  /** 相位比例，0=新月 0.5=满月 */
  phase: number;
  /** 被照亮的比例 0~1 */
  illumination: number;
  key: PhaseKey;
  name: PhaseName;
  /** 亮面在右侧（盈）还是左侧（亏） */
  waxing: boolean;
};

const BANDS: { max: number; key: PhaseKey; name: PhaseName }[] = [
  { max: 1.8457, key: "new", name: "新月（朔）" },
  { max: 5.5368, key: "waxing-crescent", name: "蛾眉月" },
  { max: 9.228, key: "first-quarter", name: "上弦月" },
  { max: 12.919, key: "waxing-gibbous", name: "盈凸月" },
  { max: 16.61, key: "full", name: "满月（望）" },
  { max: 20.302, key: "waning-gibbous", name: "亏凸月" },
  { max: 23.993, key: "last-quarter", name: "下弦月" },
  { max: 27.684, key: "waning-crescent", name: "残月" },
  { max: SYNODIC_MONTH + 1, key: "new", name: "新月（朔）" },
];

/** 传入某一天（按当地晚上 20:00 观测），返回当天月相 */
export function getMoon(date: Date): MoonInfo {
  const ms = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
  );
  const days = (ms - KNOWN_NEW_MOON) / DAY;
  let age = days % SYNODIC_MONTH;
  if (age < 0) age += SYNODIC_MONTH;

  const band = BANDS.find((b) => age < b.max) ?? BANDS[0];
  const phase = age / SYNODIC_MONTH;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;

  return {
    age: Number(age.toFixed(2)),
    phase,
    illumination,
    key: band.key,
    name: band.name,
    waxing: phase < 0.5,
  };
}

/** 生成被照亮部分的 SVG path（r 为半径，圆心在 0,0） */
export function litPath(phase: number, r: number): string {
  const cos = Math.cos(2 * Math.PI * phase);
  const rx = Math.max(Math.abs(cos) * r, 0.0001);
  const waxing = phase < 0.5;

  // 外缘半圆所在侧：盈月亮在右，亏月亮在左
  const outer = waxing ? r : -r;
  // 明暗界线（椭圆半弧）凸向：凸向暗面，才有盈亏之别
  const term = waxing ? (cos > 0 ? rx : -rx) : cos > 0 ? -rx : rx;
  const k = 0.5522847498;

  return [
    `M 0 ${-r}`,
    `C ${outer * k} ${-r} ${outer} ${-r * k} ${outer} 0`,
    `C ${outer} ${r * k} ${outer * k} ${r} 0 ${r}`,
    `C ${term * k} ${r} ${term} ${r * k} ${term} 0`,
    `C ${term} ${-r * k} ${term * k} ${-r} 0 ${-r}`,
    "Z",
  ].join(" ");
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function formatCN(date: Date): string {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
