# Book and question imports

Use **Admin → Books → JSON import** for a complete book. Use a book's **Questions → Import questions** or **Admin → Questions** for an existing topic. Upload a `.json` file or paste JSON, select **Preview and validate**, review the content, then import. No example content is inserted automatically.

A complete book:

```json
{
  "schemaVersion": 1,
  "kind": "book",
  "book": {
    "title": "Your book title",
    "description": "Your book description",
    "category": "Math",
    "published": false
  },
  "topics": [
    {
      "title": "Algebra",
      "questions": [],
      "children": [
        {
          "title": "Linear equations",
          "questions": [
            {
              "type": "mcq",
              "question": "Which value of x satisfies 2x = 8?",
              "options": ["2", "4", "6", "8"],
              "correctAnswer": 1,
              "explanation": "Divide both sides by 2: x = 4.",
              "domain": "Algebra",
              "skill": "Linear equations",
              "difficulty": "easy"
            }
          ]
        }
      ]
    }
  ]
}
```

For an existing topic:

```json
{
  "schemaVersion": 1,
  "kind": "topic",
  "questions": [
    {
      "question": "Which value of x satisfies 2x = 8?",
      "options": ["2", "4", "6", "8"],
      "correctAnswer": 1
    }
  ]
}
```

`correctAnswer` is **zero-based**: A = 0, B = 1, C = 2, D = 3. Only four-choice `mcq` questions are currently supported. Required question fields are `question`, `options`, and `correctAnswer`. Optional text fields: `passage`, `stimulus`, `explanation`, `domain`, `skill`, `source`. `difficulty` is `easy`, `medium`, or `hard` (default `medium`). Preserve line breaks using JSON `\n`; content renders as plain text, never executable HTML.

Optional assets:

```json
{
  "imageUrl": "https://your-asset-host.example/diagram.png",
  "table": {
    "columns": ["x", "y"],
    "rows": [[1, 2], [2, 4]]
  }
}
```

`imageUrl` must be a reachable HTTPS image. Add these fields to a complete question; this asset example is not a standalone question. Books support an optional HTTPS `coverUrl`. There is no automatic asset upload or PDF extraction in this phase.

Book categories: `Math`, `Reading & Writing`, `Vocabulary`, `Other`. `published` defaults to `false`; draft books are visible only to admins. Publish through **Edit book** after reviewing your content. Topic order and question order follow array order. Topic imports append to the selected topic.

Limits: 4 MB UTF-8 JSON, 500 questions, 200 topics per complete import, and eight nested subtopic levels. Tables support 1–12 columns and up to 100 rows. Errors include their JSON paths. Each import runs in one PostgreSQL transaction: failures leave no partial content. Exact duplicate imports into the same destination are rejected. Deleting that destination removes its import record, allowing a later re-import.

Only active admins can create, edit, delete, or import content. Students see published content; answer keys are stored separately behind admin-only RLS. A practice session snapshots its questions and private answer keys at creation. Subsequent edits/deletion do not change that session. Responses, review marks, and eliminations are saved through ownership-checked RPCs. Submission grades against server-held keys, then unlocks explanations for the session owner. Reloading an existing practice URL resumes it or opens its submitted review.
