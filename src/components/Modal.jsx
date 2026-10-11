import { useEffect, useRef } from "react";
export default function Modal({ title, onClose, children }) {
  const ref = useRef(null),
    outside = useRef(false);
  const isOutside = (e) => {
    const r = ref.current.getBoundingClientRect();
    return (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    );
  };
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className="learning-modal"
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        outside.current = e.target === ref.current && isOutside(e);
      }}
      onClick={(e) => {
        if (e.target === ref.current && outside.current && isOutside(e))
          onClose();
      }}
    >
      <header className="section-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="button button-secondary button-compact"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          Close
        </button>
      </header>
      {children}
    </dialog>
  );
}
