import { useEffect, useRef, useState } from "react";
export default function useContent(load, dependencies = []) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const loadedFor = useRef(null);
  const [request, setRequest] = useState({ version: 0, background: false });
  const background =
    request.background &&
    loadedFor.current?.length === dependencies.length &&
    dependencies.every((value, index) =>
      Object.is(value, loadedFor.current[index]),
    );
  useEffect(() => {
    let live = true;
    setState((s) => ({
      ...s,
      loading: !(background && s.data),
      error: "",
      refreshError: "",
    }));
    Promise.resolve()
      .then(load)
      .then((data) => {
        if (live) {
          loadedFor.current = [...dependencies];
          setState({ data, loading: false, error: "" });
        }
      })
      .catch((e) => {
        if (live)
          setState((previous) =>
            background && previous.data
              ? { ...previous, loading: false, refreshError: e.message }
              : { data: null, loading: false, error: e.message },
          );
      });
    return () => {
      live = false;
    };
  }, [...dependencies, request]);
  return {
    ...state,
    background,
    reload: (options) =>
      setRequest((previous) => ({
        version: previous.version + 1,
        background: options?.background === true,
      })),
  };
}
