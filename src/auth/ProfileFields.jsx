import { TARGET_SCORES, GOALS } from "./profile-fields.js";
import SatDateSelect from "../components/SatDateSelect.jsx";
export default function ProfileFields({ values, onChange, showGoal = true }) {
  const field = (name) => ({
    value: values[name],
    onChange: (e) => onChange(name, e.target.value),
  });
  return (
    <div className="profile-fields">
      <label className="form-span">
        Full name
        <input
          autoComplete="name"
          required
          maxLength={120}
          {...field("display_name")}
        />
      </label>
      <label>
        Current SAT score{" "}
        <span className="field-hint">
          Optional — leave empty if you haven't taken a test.
        </span>
        <input
          type="number"
          min={400}
          max={1600}
          step={10}
          {...field("current_sat_score")}
        />
      </label>
      <label>
        Target SAT score
        <input
          type="number"
          min={400}
          max={1600}
          step={10}
          required
          list="target-scores"
          placeholder="1450"
          {...field("target_sat_score")}
        />
        <datalist id="target-scores">
          {TARGET_SCORES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label>
        Grade / year
        <input
          required
          maxLength={40}
          placeholder="Grade 11, university, or graduated"
          {...field("grade")}
        />
      </label>
      <SatDateSelect label="Target test date" {...field("target_test_date")} />
      {showGoal && (
        <label className="form-span">
          Main goal
          <select required {...field("main_goal")}>
            <option value="">Choose your goal</option>
            {GOALS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
