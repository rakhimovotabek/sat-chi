import { useEffect, useRef } from "react";
export default function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
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
      onClick={(e) => {
        if (e.target === ref.current) onClose();
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
