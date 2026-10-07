The shared practice player provides Pen, Eraser, Clear annotations, and Exit drawing mode for Book Practice, Question Bank sessions, and Homework sessions. Escape also exits drawing mode.

Transparent canvases cover the passage/image panel and answer panel. When drawing is off they have no pointer hit testing and allow normal touch scrolling. While active they capture pointer input with pointer capture and `touch-action: none`. The toolbar, navigation and Desmos remain outside the drawing surfaces.

Vector strokes are saved only on the device in localStorage, keyed by user, practice session, question ID, and panel. Returning to a question or reloading restores its strokes. Clearing removes both current question panels. Eraser paths replay with `destination-out`, so images and text remain untouched. Storage failures are shown separately from answer-save status. Resize redraws preserve shape proportions using panel width; annotations are freehand overlays, not text anchors, so wrapping text can move relative to them across viewport/layout changes.

No drawing tables, uploads, credentials, or server-side persistence are added. Another device/browser will not receive these drawings.
