export function toggleDomain(filters, domain) {
  const domains = filters.domains || [];
  return {
    ...filters,
    domains: domains.includes(domain)
      ? domains.filter((d) => d !== domain)
      : [...domains, domain],
    skills: (filters.skills || []).filter((s) => s.domain !== domain),
  };
}
export function toggleSkill(filters, domain, skill, availableSkills) {
  const whole = (filters.domains || []).includes(domain);
  const selected = whole
    ? [
        ...(filters.skills || []),
        ...availableSkills.map((s) => ({ domain, skill: s })),
      ]
    : filters.skills || [];
  const has = selected.some((s) => s.domain === domain && s.skill === skill);
  return {
    ...filters,
    domains: (filters.domains || []).filter((d) => d !== domain),
    skills: has
      ? selected.filter((s) => s.domain !== domain || s.skill !== skill)
      : [...selected, { domain, skill }],
  };
}
export function shortSetTitle(title, bookTitle) {
  if (!bookTitle) return title;
  return title.replace(
    new RegExp(
      `^${bookTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[·:—–-]\\s*`,
      "i",
    ),
    "",
  );
}

export function toggleDifficulty(filters, value) {
  const selected =
    filters.difficulties ?? (filters.difficulty ? [filters.difficulty] : []);
  const rest = { ...filters };
  delete rest.difficulty;
  return {
    ...rest,
    difficulties: selected.includes(value)
      ? selected.filter((d) => d !== value)
      : [...selected, value],
  };
}
