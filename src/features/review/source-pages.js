// Filter the complete source inventory before paging blocked extraction tasks.
// Source RPC pages contain 25 rows; ordinary source browsing remains paginated.
export async function blockedSourcePage(fetchPage, page = 0) {
  const first = await fetchPage(0);
  const rows = [...first.rows];
  for (let i = 1; i < Math.ceil(first.total / 25); i++) {
    const next = await fetchPage(i);
    rows.push(...next.rows);
  }
  const blocked = rows.filter((source) => source.blocked);
  return {
    rows: blocked.slice(page * 25, page * 25 + 25),
    total: blocked.length,
  };
}
