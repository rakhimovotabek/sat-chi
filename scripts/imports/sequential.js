// Per-source failures are persisted before continuing to the next source.
export async function processSequentially(
  sources,
  processSource,
  checkpointFailure,
) {
  for (const source of sources) {
    try {
      await processSource(source);
    } catch (error) {
      await checkpointFailure(source, error);
    }
  }
}
