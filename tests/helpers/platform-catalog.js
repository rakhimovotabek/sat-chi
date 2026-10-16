import { readFile } from "node:fs/promises";
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
export async function catalogFixture() {
  return JSON.parse(
    await readFile("tests/fixtures/platform-catalog.json", "utf8"),
  );
}
// Only call with nativeAppEnvironment: public catalog metadata, synthetic
// questions and fresh IDs. Never uses a hosted connection or real answers.
export async function seedCatalogBook(app, book) {
  await app.sql(
    `insert into books(id,title,category,published,description)values(${quote(book.id)},${quote(book.title)},${quote(book.category)},true,'Isolated navigation fixture: questions are synthetic; source topic metadata is preserved.');`,
  );
  let remaining = [...book.topics];
  const inserted = new Set();
  while (remaining.length) {
    const level = remaining.filter(
      (t) => !t.parent_id || inserted.has(t.parent_id),
    );
    if (!level.length)
      throw new Error("Catalog fixture has an invalid hierarchy");
    await app.sql(
      `insert into book_topics(id,book_id,parent_id,title,position)values${level.map((t) => `(${quote(t.id)},${quote(book.id)},${t.parent_id ? quote(t.parent_id) : "null"},${quote(t.title)},${t.position})`).join(",")};`,
    );
    for (const t of level) inserted.add(t.id);
    remaining = remaining.filter((t) => !inserted.has(t.id));
  }
  const domains =
    book.category === "Math"
      ? [
          "Algebra",
          "Advanced Math",
          "Problem-Solving and Data Analysis",
          "Geometry and Trigonometry",
          "Desmos Hacks",
        ]
      : [
          "Information and Ideas",
          "Craft and Structure",
          "Expression of Ideas",
          "Standard English Conventions",
          "Unclassified reading strategy",
        ];
  const domainSql =
    "(array[" +
    domains.map(quote).join(",") +
    "])[((row_number()over(order by t.id,n)-1)%5+1)::integer]";
  await app.sql(`insert into questions(topic_id,position,question_text,options,section,domain,skill)
  select t.id,n-1,'Isolated practice: '||t.title||' · question '||n,'["1","2","3","4"]',${quote(book.category)},${domainSql},t.title
  from jsonb_to_recordset(${quote(JSON.stringify(book.topics))}::jsonb)t(id uuid,title text,questions integer)
  cross join lateral generate_series(1,t.questions)n;
  insert into question_answers(question_id,correct_answer,explanation)select q.id,1,'Synthetic fixture: choice B is the test key.'from questions q join book_topics t on t.id=q.topic_id where t.book_id=${quote(book.id)};`);
}
