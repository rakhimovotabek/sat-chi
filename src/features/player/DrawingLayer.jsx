import { useEffect, useRef } from "react";
import {
  annotationKey,
  readAnnotations,
  writeAnnotations,
} from "./annotation-model.js";
import "./annotations.css";

// Coordinates use panel width on both axes, preserving circles and staying
// anchored to the panel top when feedback/images change its height.
export default function DrawingLayer({
  userId,
  sessionId,
  questionId,
  surface,
  active,
  tool,
  clearVersion,
  onStorageError,
}) {
  const canvas = useRef(null),
    strokes = useRef([]),
    pointer = useRef(null),
    frame = useRef(null);
  const key = annotationKey(userId, sessionId, questionId, surface);
  const keyRef = useRef(key),
    errorRef = useRef(onStorageError);
  errorRef.current = onStorageError;
  const persist = () => {
    try {
      writeAnnotations(window.localStorage, keyRef.current, strokes.current);
    } catch {
      errorRef.current(
        "Drawings are available in this tab, but could not be saved on this device.",
      );
    }
  };
  const context = () => {
    const element = canvas.current;
    if (!element) return null;
    return {
      ctx: element.getContext("2d"),
      width: element.getBoundingClientRect().width,
    };
  };
  function paint(stroke, points) {
    const state = context();
    if (!state?.ctx || !state.width) return;
    const { ctx, width } = state;
    ctx.globalCompositeOperation =
      stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = "#245bcc";
    ctx.fillStyle = "#245bcc";
    ctx.lineWidth = Math.max(
      stroke.tool === "eraser" ? 10 : 1.5,
      stroke.width * width,
    );
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (points.length === 1) {
      ctx.arc(
        points[0][0] * width,
        points[0][1] * width,
        ctx.lineWidth / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else {
      ctx.moveTo(points[0][0] * width, points[0][1] * width);
      for (const point of points.slice(1))
        ctx.lineTo(point[0] * width, point[1] * width);
      ctx.stroke();
    }
  }
  const redraw = () => {
    const state = context();
    if (!state?.ctx) return;
    state.ctx.clearRect(0, 0, canvas.current.width, canvas.current.height);
    strokes.current.forEach((stroke) => paint(stroke, stroke.points));
  };
  const finish = () => {
    if (pointer.current === null) return;
    const id = pointer.current;
    pointer.current = null;
    if (canvas.current?.hasPointerCapture(id))
      canvas.current.releasePointerCapture(id);
    persist();
  };
  useEffect(() => {
    keyRef.current = key;
    try {
      strokes.current = readAnnotations(window.localStorage, key);
    } catch {
      strokes.current = [];
      errorRef.current("Saved drawings could not be loaded on this device.");
    }
    const element = canvas.current;
    const resize = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect(),
          dpr = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.max(1, Math.round(rect.width * dpr));
        element.height = Math.max(1, Math.round(rect.height * dpr));
        element.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
        redraw();
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const flush = () => {
      if (pointer.current !== null) persist();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      finish();
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      window.removeEventListener("pagehide", flush);
    };
  }, [key]);
  const initialClear = useRef(clearVersion);
  useEffect(() => {
    if (clearVersion === initialClear.current) return;
    initialClear.current = clearVersion;
    finish();
    strokes.current = [];
    persist();
    redraw();
  }, [clearVersion]);
  useEffect(() => {
    if (!active) finish();
  }, [active]);
  function point(event) {
    const rect = canvas.current.getBoundingClientRect();
    return [
      Math.max(0, Math.min(rect.width, event.clientX - rect.left)) / rect.width,
      Math.max(0, Math.min(rect.height, event.clientY - rect.top)) / rect.width,
    ];
  }
  function down(event) {
    if (!active || pointer.current !== null || event.button !== 0) return;
    if (strokes.current.length >= 2000) {
      errorRef.current("Drawing limit reached. Clear annotations to continue.");
      return;
    }
    event.preventDefault();
    pointer.current = event.pointerId;
    canvas.current.setPointerCapture(event.pointerId);
    const width = canvas.current.getBoundingClientRect().width;
    const stroke = {
      tool,
      width: (tool === "eraser" ? 22 : 3) / width,
      points: [point(event)],
    };
    strokes.current.push(stroke);
    paint(stroke, stroke.points);
  }
  function move(event) {
    if (pointer.current !== event.pointerId) return;
    event.preventDefault();
    const stroke = strokes.current.at(-1);
    const events = event.nativeEvent.getCoalescedEvents?.() || [event];
    for (const next of events.length ? events : [event]) {
      if (stroke.points.length >= 10000) {
        finish();
        break;
      }
      const p = point(next),
        last = stroke.points.at(-1);
      stroke.points.push(p);
      paint(stroke, [last, p]);
    }
  }
  return (
    <canvas
      ref={canvas}
      className={`annotation-canvas ${active ? "is-drawing" : ""}`}
      aria-label={`Drawing layer over ${surface}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
    />
  );
}
