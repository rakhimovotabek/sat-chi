import { useState } from "react";
function CoverImage({ src, book }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      width="480"
      height="720"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="book-cover-placeholder">
      <small>{book.category || "Vocabulary"}</small>
      <strong>{book.title || "SAT’chi"}</strong>
      <small>Title preview · SAT’chi</small>
    </span>
  );
}
export default function BookCover({ book, className = "" }) {
  const src = book.cover_url || book.cover_image_url;
  return (
    <div className={`book-cover ${className}`}>
      <CoverImage key={src || "fallback"} src={src} book={book} />
    </div>
  );
}
