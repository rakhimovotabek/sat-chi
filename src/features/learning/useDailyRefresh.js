import { useEffect, useState } from "react";
// Refresh derived deadline states while a homework page stays open across midnight.
export default function useDailyRefresh() {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const update = () => setMinute(Math.floor(Date.now() / 60000));
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  return minute;
}
