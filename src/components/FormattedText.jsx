import React from "react";
import { parseFormattedText } from "./formatted-text.js";

// Build React elements, never HTML. No source attributes or URLs are accepted.
export default function FormattedText({ children }) {
  const render = (nodes) =>
    nodes.map((node, i) =>
      typeof node === "string"
        ? node
        : React.createElement(
            node.tag,
            { key: i },
            node.tag === "br" ? undefined : render(node.children),
          ),
    );
  return render(parseFormattedText(children));
}
