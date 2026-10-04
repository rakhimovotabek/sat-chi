import { useState } from "react";
import {
  SAT_DATES,
  upcomingSatDates,
  formatSatDate,
} from "../data/sat-dates.js";
export default function SatDateSelect({
  value,
  defaultValue = "",
  onChange,
  name,
  label = "SAT date",
}) {
  const [selected, setSelected] = useState(defaultValue);
  const current = value ?? selected;
  const dates = upcomingSatDates(),
    record = SAT_DATES.find((d) => d.date === current);
  return (
    <div className="sat-date-field">
      <label>
        {label}
        <select
          name={name}
          aria-label={label}
          value={current}
          onChange={(e) => {
            setSelected(e.target.value);
            onChange?.(e);
          }}
        >
          <option value="">Not sure yet</option>
          {current && !dates.some((d) => d.date === current) && (
            <option value={current} disabled>
              {formatSatDate(current)} · Previous selection
            </option>
          )}
          {dates.map((d) => (
            <option key={d.date} value={d.date}>
              {formatSatDate(d.date)}
              {d.status === "anticipated"
                ? " · Anticipated"
                : ` · Register by ${formatSatDate(d.registrationDeadline)}`}
            </option>
          ))}
        </select>
      </label>
      {record && (
        <small>
          {record.status === "anticipated"
            ? "Anticipated date — awaiting College Board confirmation."
            : `Registration deadline: ${formatSatDate(record.registrationDeadline)} · Late registration: ${formatSatDate(record.lateRegistrationDeadline)}`}
        </small>
      )}
    </div>
  );
}
