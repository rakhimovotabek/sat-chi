const allowed = new Set([
  "u",
  "em",
  "i",
  "strong",
  "b",
  "mark",
  "br",
  "p",
  "sup",
  "sub",
]);
const discarded = new Set([
  "a",
  "span",
  "div",
  "img",
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "svg",
  "path",
  "video",
  "audio",
  "source",
  "input",
  "button",
  "form",
  "link",
  "meta",
  "html",
  "body",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);
const entities = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  ndash: "–",
  mdash: "—",
};
function decode(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (raw, key) => {
    if (key[0] !== "#") return entities[key] ?? raw;
    const n =
      key[1].toLowerCase() === "x"
        ? parseInt(key.slice(2), 16)
        : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
      ? String.fromCodePoint(n)
      : raw;
  });
}
export function parseFormattedText(value) {
  const text = String(value ?? "").replace(
    /<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    "",
  );
  const root = { children: [] },
    stack = [root];
  for (const token of text.split(/(<\/?[a-z][^>]*>)/gi)) {
    const tag = token.match(/^<(\/?)\s*([a-z][\w-]*)\b[^>]*>$/i);
    if (!tag) {
      if (token) stack.at(-1).children.push(decode(token));
      continue;
    }
    const name = tag[2].toLowerCase();
    if (!allowed.has(name)) {
      if (!discarded.has(name)) stack.at(-1).children.push(decode(token));
      continue;
    }
    if (tag[1]) {
      const index = stack.findLastIndex((node) => node.tag === name);
      if (index > 0) stack.length = index;
    } else {
      const node = { tag: name, children: [] };
      stack.at(-1).children.push(node);
      if (name !== "br") stack.push(node);
    }
  }
  return root.children;
}

export function formattedTextPlain(value) {
  const flatten = (nodes) =>
    nodes
      .map((node) =>
        typeof node === "string"
          ? node
          : node.tag === "br"
            ? "\n"
            : flatten(node.children) + (node.tag === "p" ? "\n" : ""),
      )
      .join("");
  return flatten(parseFormattedText(value));
}
