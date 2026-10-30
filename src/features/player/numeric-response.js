// Syntax validation only. Authoritative grading uses exact PostgreSQL numerics.
export function normalizeNumericResponse(value) {
  return String(value ?? "")
    .trim()
    .replace(/^[−–—](?=[0-9.])/, "-");
}
export function numericResponseError(value) {
  const text = normalizeNumericResponse(value);
  if (!text) return "Enter an integer, decimal or fraction.";
  if (text.length > (text.startsWith("-") ? 6 : 5))
    return "Use up to five characters, or six including a leading minus sign.";
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+|\d+\/\d+)$/.test(text) || /\/0+$/.test(text))
    return "Enter a valid number or fraction with a nonzero denominator.";
  return "";
}
