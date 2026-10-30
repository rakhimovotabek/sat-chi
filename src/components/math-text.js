export function splitMathText(text) {
  const parts = [],
    pattern =
      /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\s)[^$\n]+?(?<!\s)(?<!\\)\$/g;
  let offset = 0;
  for (const match of String(text).matchAll(pattern)) {
    if (match.index > offset)
      parts.push({ text: text.slice(offset, match.index) });
    const raw = match[0],
      width = raw.startsWith("$$") || raw.startsWith("\\") ? 2 : 1;
    parts.push({
      math: raw.slice(width, -width),
      display: raw.startsWith("$$") || raw.startsWith("\\["),
      raw,
    });
    offset = match.index + raw.length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts;
}
