import { useEffect, useState } from "react";

export default function BattleTimer({ deadline, serverNow }) {
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    const budget = Date.parse(deadline) - Date.parse(serverNow);
    if (!Number.isFinite(budget)) {
      setRemaining(null);
      return;
    }
    const anchor = performance.now();
    const tick = () =>
      setRemaining(
        Math.max(0, Math.ceil((budget - (performance.now() - anchor)) / 1000)),
      );
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline, serverNow]);
  return remaining === null ? null : (
    <p
      className="battle-timer"
      role="timer"
      aria-live="off"
      aria-label="Time remaining"
    >
      {remaining} seconds remaining
    </p>
  );
}
