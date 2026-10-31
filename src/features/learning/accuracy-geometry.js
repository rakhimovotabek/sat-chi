// Unknown dates/rates create gaps. Never fabricate zero accuracy or interpolate
// across missing dates. The supplied rates remain the server's daily values.
export function accuracyGeometry(days) {
  const width = 600,
    height = 180,
    baseline = 168,
    top = 12;
  const points = [],
    segments = [];
  let segment = [],
    previousDay = null;
  const finish = () => {
    if (segment.length > 1) segments.push(segment);
    segment = [];
    previousDay = null;
  };
  for (const [index, row] of days.entries()) {
    const value = row.accuracy == null ? null : Number(row.accuracy);
    const day = Date.parse(row.day);
    if (
      !Number.isFinite(day) ||
      new Date(day).toISOString().slice(0, 10) !== row.day ||
      value === null ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100 ||
      !(Number(row.known) > 0)
    ) {
      finish();
      continue;
    }
    if (previousDay !== null && day - previousDay !== 86400000) finish();
    const point = {
      ...row,
      accuracy: value,
      x:
        days.length === 1
          ? width / 2
          : 12 + (index / (days.length - 1)) * (width - 24),
      y: baseline - (value / 100) * (baseline - top),
    };
    points.push(point);
    segment.push(point);
    previousDay = day;
  }
  finish();
  const format = (value) => Number(value.toFixed(3));
  return {
    width,
    height,
    baseline,
    top,
    points,
    paths: segments.map((part) =>
      part
        .map(
          (point, index) =>
            `${index ? "L" : "M"}${format(point.x)} ${format(point.y)}`,
        )
        .join(" "),
    ),
  };
}
