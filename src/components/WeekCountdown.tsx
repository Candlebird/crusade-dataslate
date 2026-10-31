import { useEffect, useState } from 'react';
import { nextWeekReset, timeLeft } from '../model/date';

/** How long until the weekly reset (the Weekly Siege, the Sortie weekly challenge): Monday at midnight, the player's own time. */
export function WeekCountdown({ className = '' }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const reset = nextWeekReset(now);
  const when = reset.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  return (
    <span className={`week-countdown ${className}`} data-tip={`The week resets ${when} (your time): new map, new boards. Last week's winners are settled then.`}>
      Resets in <b>{timeLeft(reset.getTime() - now.getTime())}</b> <span className="muted">(Monday 00:00 your time)</span>
    </span>
  );
}
