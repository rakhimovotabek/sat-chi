import { useState } from "react";
function CoverImage({ src, fallback }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <span>{fallback || "SAT’chi"}</span>
  );
}
export default function BookCover({ book, className = "" }) {
  const src = book.cover_url || book.cover_image_url;
  return (
    <div className={`book-cover ${className}`}>
      <CoverImage
        key={src || "fallback"}
        src={src}
        fallback={book.category || "Vocabulary"}
      />
    </div>
  );
}
