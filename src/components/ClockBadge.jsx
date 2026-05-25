import { useEffect, useState } from "react";

/**
 * Маленький ізольований компонент, що оновлюється щосекунди.
 * Винесений з App.jsx, щоб тікаючий годинник не змушував
 * перерендерюватись усе кореневе дерево щосекунди.
 */
export function useTickingNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function ClockBadgeTime({ className }) {
  const now = useTickingNow(1000);
  return (
    <span className={className}>
      {now.toLocaleTimeString("uk-UA", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}
    </span>
  );
}

export function ClockBadgeDateTime({ prefix = "Оновлено:", className }) {
  // Для бейджа "Оновлено" 1 раз/сек надлишково — оновлюємо раз на 30 с.
  const now = useTickingNow(30000);
  return (
    <div className={className}>
      {prefix} {now.toLocaleString("uk-UA")}
    </div>
  );
}

export default ClockBadgeTime;
