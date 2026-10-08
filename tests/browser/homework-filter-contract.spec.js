import { test, expect } from "@playwright/test";
import { learningFixture } from "./helpers/learning.js";

for (const mode of ["legacy", "invalid", "current"]) {
  test(`assignment picker ${mode} contract never returns an unsafe legacy pool`, async ({
    page,
  }) => {
    await learningFixture(page, "admin");
    const requests = [];
    await page.route("**/rest/v1/rpc/question_bank", async (route) => {
      const body = route.request().postDataJSON();
      requests.push(body);
      const error =
        mode === "invalid" || (mode === "legacy" && body.p_filters.assignment);
      await route.fulfill({
        status: error ? 400 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          error
            ? { code: "P0001", message: "Invalid filters" }
            : { count: 1, rows: [{ id: "eligible-fixture" }] },
        ),
      });
    });
    await page.goto("/admin/homework");
    await expect(
      page.getByRole("heading", { name: "Homework", exact: true }),
    ).toBeVisible();
    const filters = {
      book: "c0000000-0000-0000-0000-000000000001",
      difficulties: ["easy", "medium"],
    };
    const result = await page.evaluate(async (filters) => {
      const { assignmentBank } = await import("/src/features/learning/api.js");
      try {
        return { data: await assignmentBank(filters, 2) };
      } catch (e) {
        return { error: e.message };
      }
    }, filters);
    expect(requests[0]).toEqual({
      p_filters: { ...filters, assignment: true },
      p_page: 2,
    });
    if (mode === "current") {
      expect(requests).toHaveLength(1);
      expect(result.data.rows).toHaveLength(1);
    } else {
      expect(requests[1]).toEqual({ p_filters: filters, p_page: 2 });
      expect(result.data).toBeUndefined();
      expect(result.error).toMatch(
        mode === "legacy" ? /requires a server update/ : /^Invalid filters$/,
      );
    }
  });
}
