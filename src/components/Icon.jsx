const paths = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  homework: "M9 4H5v17h14V4h-4 M9 3h6v4H9z M8 12h8 M8 16h5",
  books:
    "M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1z M12 5v15",
  vocabulary: "M4 4h16v16H4z M7 15l3-7 3 7 M8 13h4 M15 9h2 M15 13h2",
  questions:
    "M8 8a4 4 0 0 1 8 0c0 3-4 3-4 6 M12 18h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  standings:
    "M8 3h8v6a4 4 0 0 1-8 0z M8 5H4v3a4 4 0 0 0 4 4 M16 5h4v3a4 4 0 0 1-4 4 M12 13v5 M8 21h8 M10 18h4v3",
  profile: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  groups:
    "M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M2 21v-2a8 8 0 0 1 16 0v2 M17 4a4 4 0 0 1 0 8 M19 15a5 5 0 0 1 3 5v1",
  results: "M4 3v18h17 M8 17v-5 M13 17V8 M18 17V5",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  chevron: "M6 9l6 6 6-6",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "M6 6l12 12 M18 6 6 18",
};

export default function Icon({ name, className = "" }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.books} />
    </svg>
  );
}
