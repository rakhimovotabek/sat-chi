import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import { supabase } from "../lib/supabase.js";
export default function QuestionImage({ src, alt, allowZoom = true }) {
  const [url, setUrl] = useState(null),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const [zoom, setZoom] = useState(300);
  const packageImage = src.includes(
    "/storage/v1/object/authenticated/book-package-assets/",
  );
  useEffect(() => {
    let active = true;
    setFailed(false);
    setUrl(null);
    async function resolve() {
      const packageAsset = src.includes(
        "/storage/v1/object/authenticated/book-package-assets/",
      );
      const bucket = packageAsset ? "book-package-assets" : "question-assets";
      const marker = `/storage/v1/object/authenticated/${bucket}/`;
      if (!src.includes(marker)) {
        setUrl(src);
        return;
      }
      try {
        const path = src.split(marker)[1];
        if (
          !(
            packageAsset
              ? /^[a-f0-9]{64}\/[a-f0-9]{64}\.(?:png|jpe?g)$/
              : /^[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/
          ).test(path)
        )
          throw new Error("Invalid asset");
        const { data, error } = await supabase.storage
          .from(bucket)
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
    <>
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
              alt ||
              (src.includes("/question-assets/") ||
              src.includes("/book-package-assets/")
                ? "Original source question and mathematical notation"
                : "Question reference diagram")
            }
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <p role="status">Loading source image…</p>
        )}
        {url && !failed && packageImage && allowZoom && (
          <figcaption>
            <button
              type="button"
              className="button button-secondary button-compact book-image-enlarge"
              onClick={() => setEnlarged(true)}
            >
              Enlarge image
            </button>
          </figcaption>
        )}
      </figure>
      {enlarged && url && (
        <Modal title="Source image" onClose={() => setEnlarged(false)}>
          <label className="book-image-zoom">
            Image size
            <select
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            >
              {[100, 200, 300, 400, 600].map((value) => (
                <option value={value} key={value}>
                  {value}%
                </option>
              ))}
            </select>
          </label>
          <div
            className="book-image-viewer"
            tabIndex={0}
            role="region"
            aria-label="Enlarged source image; scroll to read"
          >
            <img
              src={url}
              alt={alt || "Original book source image"}
              style={{
                width: `${zoom}%`,
                maxWidth: "none",
                maxHeight: "none",
                height: "auto",
              }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
