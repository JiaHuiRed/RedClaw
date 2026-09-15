import { useState } from "react";
import type { CronScheduleInput } from "../gateway/client";

export type ScheduleMode = "once" | "daily" | "weekly" | "monthly" | "interval" | "advanced";

const MODE_LABELS: Record<ScheduleMode, string> = {
  once: "单次",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  interval: "间隔",
  advanced: "高级",
};

const WEEKDAYS = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 0, label: "日" },
];

function hmToCronMinutes(hm: string): { min: number; hour: number } | null {
  const [h, m] = hm.split(":").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return { min: m, hour: h };
}

export interface ScheduleResult {
  schedule: CronScheduleInput;
  summary: string;
}

// 自含状态的选择器：只在产出有效调度时回调 onChange（value 无需回灌）
interface SchedulePickerProps {
  onChange: (next: ScheduleResult) => void;
}

const inputStyle = {
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

// 友好频率选择器：one-time/daily/weekly/monthly/interval 六种模式产出 cron/at/every
// 调度（借鉴 eigent Trigger SchedulePicker）；「高级」保留裸 cron 给高级用户。
export default function SchedulePicker({ onChange }: SchedulePickerProps) {
  const [mode, setMode] = useState<ScheduleMode>("daily");
  const [time, setTime] = useState("09:00");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [monthDay, setMonthDay] = useState(1);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [advancedExpr, setAdvancedExpr] = useState("0 9 * * *");

  function emit(next: ScheduleResult) {
    onChange(next);
  }

  function pickMode(next: ScheduleMode) {
    setMode(next);
    const hm = hmToCronMinutes(time);
    if (next === "daily" && hm) {
      emit({
        schedule: { kind: "cron", expr: `${hm.min} ${hm.hour} * * *`, tz: "Asia/Hong_Kong" },
        summary: `每天 ${time}`,
      });
    } else if (next === "advanced") {
      emit({
        schedule: { kind: "cron", expr: advancedExpr, tz: "Asia/Hong_Kong" },
        summary: advancedExpr,
      });
    }
    // 其余模式需要用户补全选择后再产出，不预发无效值
  }

  function buildFromDaily(hm: string) {
    const parts = hmToCronMinutes(hm);
    if (!parts) return;
    emit({
      schedule: { kind: "cron", expr: `${parts.min} ${parts.hour} * * *`, tz: "Asia/Hong_Kong" },
      summary: `每天 ${hm}`,
    });
  }

  function buildFromWeekly(days: number[], hm: string) {
    const parts = hmToCronMinutes(hm);
    if (!parts || days.length === 0) return;
    const ordered = [...days].sort((a, b) => a - b);
    // cron 周字段 0/7 都是周日，统一用 0-6
    emit({
      schedule: {
        kind: "cron",
        expr: `${parts.min} ${parts.hour} * * ${ordered.join(",")}`,
        tz: "Asia/Hong_Kong",
      },
      summary: `每周 ${ordered.map((d) => WEEKDAYS.find((w) => w.value === d)?.label ?? d).join("、")} ${hm}`,
    });
  }

  function buildFromMonthly(day: number, hm: string) {
    const parts = hmToCronMinutes(hm);
    if (!parts || !Number.isFinite(day) || day < 1 || day > 31) return;
    emit({
      schedule: {
        kind: "cron",
        expr: `${parts.min} ${parts.hour} ${day} * *`,
        tz: "Asia/Hong_Kong",
      },
      summary: `每月 ${day} 号 ${hm}`,
    });
  }

  function buildFromInterval(minutes: number) {
    if (!Number.isFinite(minutes) || minutes < 1) return;
    const ms = Math.round(minutes * 60_000);
    emit({
      schedule: { kind: "every", everyMs: ms },
      summary: minutes % 60 === 0 ? `每 ${minutes / 60} 小时` : `每 ${minutes} 分钟`,
    });
  }

  function buildFromOnce(local: string) {
    if (!local) return;
    const at = new Date(local);
    if (Number.isNaN(at.getTime())) return;
    emit({
      schedule: { kind: "at", at: at.toISOString() },
      summary: `${at.toLocaleString()} 执行一次`,
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {(Object.keys(MODE_LABELS) as ScheduleMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => pickMode(m)}
            className="text-[11px] px-2 py-1 rounded-md font-medium transition-colors hover:opacity-80"
            style={{
              background: mode === m ? "var(--accent)" : "var(--bg-tertiary)",
              color: mode === m ? "var(--on-solid)" : "var(--text-secondary)",
            }}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {(mode === "daily" || mode === "weekly" || mode === "monthly") && (
        <div className="space-y-2">
          {mode === "weekly" && (
            <div className="flex gap-1">
              {WEEKDAYS.map((w) => {
                const active = weekdays.includes(w.value);
                return (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? weekdays.filter((d) => d !== w.value)
                        : [...weekdays, w.value];
                      setWeekdays(next);
                      buildFromWeekly(next, time);
                    }}
                    className="flex-1 text-[11px] py-1 rounded-md font-medium transition-colors hover:opacity-80"
                    style={{
                      background: active ? "var(--accent)" : "var(--bg-tertiary)",
                      color: active ? "var(--on-solid)" : "var(--text-secondary)",
                    }}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          )}
          {mode === "monthly" && (
            <input
              type="number"
              min={1}
              max={31}
              className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
              style={inputStyle}
              value={monthDay}
              onChange={(e) => {
                const day = Number.parseInt(e.target.value, 10);
                setMonthDay(day);
                buildFromMonthly(day, time);
              }}
              placeholder="几号（1-31）"
            />
          )}
          <input
            type="time"
            className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
            style={inputStyle}
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              if (mode === "daily") buildFromDaily(e.target.value);
              else if (mode === "weekly") buildFromWeekly(weekdays, e.target.value);
              else if (mode === "monthly") buildFromMonthly(monthDay, e.target.value);
            }}
          />
        </div>
      )}

      {mode === "interval" && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            className="flex-1 text-xs px-2.5 py-2 rounded-lg outline-none"
            style={inputStyle}
            value={intervalMinutes}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              setIntervalMinutes(v);
              buildFromInterval(v);
            }}
            placeholder="间隔"
          />
          <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
            分钟
          </span>
        </div>
      )}

      {mode === "once" && (
        <input
          type="datetime-local"
          className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
          style={inputStyle}
          onChange={(e) => buildFromOnce(e.target.value)}
        />
      )}

      {mode === "advanced" && (
        <div className="space-y-1">
          <input
            className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
            style={{ ...inputStyle, fontFamily: "var(--font-mono, monospace)" }}
            value={advancedExpr}
            onChange={(e) => {
              setAdvancedExpr(e.target.value);
              const expr = e.target.value.trim();
              if (expr.split(/\s+/).length === 5) {
                emit({
                  schedule: { kind: "cron", expr, tz: "Asia/Hong_Kong" },
                  summary: expr,
                });
              }
            }}
            placeholder="0 9 * * *"
            spellCheck={false}
          />
          <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
            分 时 日 月 周 —— 「0 9,14,20 * * *」= 每天 9/14/20 点
          </span>
        </div>
      )}
    </div>
  );
}
