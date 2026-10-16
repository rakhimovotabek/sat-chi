# Answer statistics contract

Global learning totals count each canonical question once per student across Books, Question Bank and Homework. Frozen session items, Homework grading and check events remain separate and unchanged. Vocabulary has its own measures.

- **Attempted:** at least one saved nonempty answer (including a subsequently cleared answer), or recorded check/submission. Retries, refreshes and repeated contexts do not add questions.
- **Checked:** a saved check or an answered submitted item. Merely selecting an answer is not a check.
- **First correct / incorrect:** the earliest recorded checked outcome across that student's contexts. Later corrections and grading overrides cannot erase it.
- **Unknown first outcome:** an older graded snapshot without original checks. Its final grade is usable for mastery but cannot establish initial accuracy. An earlier unknown record keeps the global first outcome unknown even if a later session has checks.
- **First-attempt accuracy:** first correct / known first outcomes. Null without evidence; display partial history when unknown outcomes exist. Never divide by unanswered or ungraded questions.
- **Eventually correct:** at least one recorded correct outcome. **Currently correct:** most recent graded outcome. These can differ after another attempt or grading correction.
- **Still incorrect:** most recent recorded grade is false. Draft answer edits are ungraded and do not create outcomes.
- **Unanswered:** no current nonempty selection/response in the relevant session. Not an incorrect answer.
- **Pending manual grading:** a submitted open response with no grade. Exclude it from graded accuracy.
- **Completion:** current session's answered / assigned questions; book solved progress is distinct eligible questions ever correct / eligible catalog questions. Homework completion requires submission under its existing rules.

Manual review preserves the original automatic outcome and records the adjudication separately. First-attempt accuracy describes the recorded initial result; current assignment grading describes the latest adjudicated grade. A review is not a student retry. No missing historical timestamp or first answer is inferred from the final answer. Prior activity is read-only evidence; it is never a newly submitted Homework answer.

`question_check_attempts` remains the authoritative Check log. Additive `practice_grade_events` records submissions and future review decisions. Legacy snapshot events remain `first_known=false` unless an existing manual review preserves the original `automatic_correct` result. That frozen result is usable evidence; the later adjudicated result is not. A recorded, initially pending submission receives its first outcome from the earliest recorded manual grade, while the original pending event remains unchanged. Internal canonical queries use the existing student/session and item/event indexes and do not expose private functions or table mutation rights to browser roles.
