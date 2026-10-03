import { useEffect, useState } from "react";
export default function useContent(load, dependencies = []) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    Promise.resolve()
      .then(load)
      .then((data) => {
        if (live) setState({ data, loading: false, error: "" });
      })
      .catch((e) => {
        if (live) setState({ data: null, loading: false, error: e.message });
      });
    return () => {
      live = false;
    };
  }, [...dependencies, version]);
  return { ...state, reload: () => setVersion((v) => v + 1) };
}
