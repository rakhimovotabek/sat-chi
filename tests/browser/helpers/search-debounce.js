// Hold only the UI's 250ms search debounce. Freezing the entire browser clock
// would also suspend SDK Auth initialization, obscuring the pagination race.
export async function holdSearchDebounces(page) {
  await page.addInitScript(() => {
    const set = window.setTimeout.bind(window),
      clear = window.clearTimeout.bind(window);
    const pending = new Map();
    window.setTimeout = (fn, delay, ...args) => {
      if (delay !== 250) return set(fn, delay, ...args);
      const id = set(() => {}, 60000);
      pending.set(id, () => fn(...args));
      return id;
    };
    window.clearTimeout = (id) => {
      pending.delete(id);
      clear(id);
    };
    window.runSearchDebounces = () => {
      const entries = [...pending];
      pending.clear();
      for (const [id, fn] of entries) {
        clear(id);
        fn();
      }
    };
  });
}
export const runSearchDebounces = (page) =>
  page.evaluate(() => window.runSearchDebounces());
