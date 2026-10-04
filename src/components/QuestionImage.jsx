import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
export default function QuestionImage({ src }) {
  const [url, setUrl] = useState(null),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    setUrl(null);
    async function resolve() {
      const marker = "/storage/v1/object/authenticated/question-assets/";
      if (!src.includes(marker)) {
        setUrl(src);
        return;
      }
      try {
        const path = src.split(marker)[1];
        if (!/^[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/.test(path))
          throw new Error("Invalid asset");
        const { data, error } = await supabase.storage
          .from("question-assets")
          .createSignedUrl(path, 3600);
        if (error) throw error;
        if (active) setUrl(data.signedUrl);
      } catch {
        if (active) setFailed(true);
      }
    }
    resolve();
    return () => {
      active = false;
    };
  }, [src, retry]);
  return (
    <figure>
      {failed ? (
        <>
          <figcaption>
            Reference image could not load. Check your connection before
            answering.
          </figcaption>
          <button
            className="button button-secondary button-compact"
            onClick={() => setRetry((v) => v + 1)}
          >
            Retry image
          </button>
        </>
      ) : url ? (
        <img
          src={url}
          alt={
            src.includes("/question-assets/")
              ? "Original source question and mathematical notation"
              : "Question reference diagram"
          }
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <p role="status">Loading source image…</p>
      )}
    </figure>
  );
}
