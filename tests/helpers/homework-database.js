import { learningDatabase, admin } from "./database.js";
export async function homeworkDatabase() {
  const fixture = await learningDatabase();
  const { role, call } = fixture;
  await role(admin);
  await call(
    "import_book_content",
    [
      JSON.stringify({
        schemaVersion: 1,
        kind: "book",
        book: {
          title: "Homework disposable geometry",
          category: "Math",
          published: true,
        },
        topics: [
          {
            title: "Geometry",
            questions: Array.from({ length: 40 }, (_, i) => ({
              type: "mcq",
              question: `Geometry disposable ${i}`,
              options: ["1", "2", "3", "4"],
              correctAnswer: 1,
              explanation: "Supplied key",
              domain: "Geometry and Trigonometry",
              skill: "Area",
              difficulty: "medium",
            })),
          },
        ],
      }),
    ],
    ["jsonb"],
  );
  return fixture;
}
