import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import {
  resolveQuestionImage,
  invalidateQuestionImage,
} from "./question-image-source.js";
import useAuth from "../hooks/useAuth.js";
export default function QuestionImage({ src, alt, allowZoom = true }) {
  const { session } = useAuth();
  const owner = session?.user?.id;
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
      try {
        const signed = await resolveQuestionImage(src, owner);
        if (active) setUrl(signed);
      } catch {
        if (active) setFailed(true);
      }
    }
    resolve();
    return () => {
      active = false;
    };
  }, [src, owner, retry]);
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
              type="button"
              onClick={() => {
                invalidateQuestionImage(src, owner);
                setRetry((v) => v + 1);
              }}
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
