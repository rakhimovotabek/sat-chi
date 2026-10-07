export const annotationKey = (userId, sessionId, questionId, surface) =>
  `satchi:drawings:v1:${userId}:${sessionId}:${questionId}:${surface}`;

export function readAnnotations(storage, key) {
  const data = JSON.parse(storage.getItem(key) || "null");
  if (!data || data.version !== 1) return [];
  if (!Array.isArray(data.strokes) || data.strokes.length > 2000) return [];
  return data.strokes.filter(
    (stroke) =>
      ["pen", "eraser"].includes(stroke.tool) &&
      Number.isFinite(stroke.width) &&
      stroke.width > 0 &&
      stroke.width < 1 &&
      Array.isArray(stroke.points) &&
      stroke.points.length > 0 &&
      stroke.points.length <= 10000 &&
      stroke.points.every(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          point.every((n) => Number.isFinite(n) && n >= 0 && n <= 100),
      ),
  );
}
export function writeAnnotations(storage, key, strokes) {
  if (!strokes.length) storage.removeItem(key);
  else storage.setItem(key, JSON.stringify({ version: 1, strokes }));
}
