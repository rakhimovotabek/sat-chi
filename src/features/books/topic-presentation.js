// Presentation only: stable links, source order, topic IDs and snapshots stay intact.
export function compactTopicChildren(topics, parent) {
  const children = topics.filter((t) => t.parent_id === parent);
  return (
    children.length >= 8 &&
    children.filter(
      (t) =>
        (t.progress?.total ?? t.questions?.[0]?.count ?? 0) <= 2 &&
        !topics.some((c) => c.parent_id === t.id),
    ).length /
      children.length >=
      0.75
  );
}

export function delegatesToOnlyChild(topics, topic) {
  return (
    (topic.questions?.[0]?.count || 0) === 0 &&
    topics.filter((t) => t.parent_id === topic.id).length === 1
  );
}
