import { useState } from "react";
export default function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
