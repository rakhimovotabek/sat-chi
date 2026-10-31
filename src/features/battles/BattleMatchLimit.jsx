export default function BattleMatchLimit({ value = 0, onChange }) {
  return (
    <label>
      Whole-match limit
      <select
        aria-label="Whole-match limit"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        <option value={0}>No whole-match limit</option>
        {[30, 60, 120, 180, 300, 600, 1200, 1800, 3600].map((seconds) => (
          <option key={seconds} value={seconds}>
            {seconds < 60 ? `${seconds} seconds` : `${seconds / 60} ${seconds === 60 ? "minute" : "minutes"}`}
          </option>
        ))}
      </select>
    </label>
  );
}
