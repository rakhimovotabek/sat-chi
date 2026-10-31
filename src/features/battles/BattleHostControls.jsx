import { useEffect, useState } from "react";
import BattleMatchLimit from "./BattleMatchLimit.jsx";

export default function BattleHostControls({ room, busy, onControl }) {
  const [count, setCount] = useState(room.question_count);
  const [seconds, setSeconds] = useState(room.seconds);
  const [totalSeconds, setTotalSeconds] = useState(room.total_seconds || 0);
  const [isPublic, setPublic] = useState(room.public);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [removing, setRemoving] = useState(null);
  const [saved, setSaved] = useState("");
  const submitControl = async (action, data) => {
    setSaved("");
    const success = await onControl(action, data);
    if (success) setSaved("Lobby updated. Everyone needs to mark ready again.");
    return success;
  };
  useEffect(() => {
    setCount(room.question_count);
    setSeconds(room.seconds);
    setTotalSeconds(room.total_seconds || 0);
    setPublic(room.public);
  }, [room.question_count, room.seconds, room.public, room.total_seconds]);
  const firstMember = room.members.find((member) => member.user_id === first);
  return (
    <details className="battle-host-controls">
      <summary>Host controls</summary>
      {saved && <p role="status">{saved}</p>}
      <p>
        Changes reset everyone’s ready status. The question sources and format
        stay as selected when this lobby was created.
      </p>
      <form
        className="battle-settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          submitControl("settings", {
            questionCount: Number(count),
            seconds: Number(seconds),
            totalSeconds,
            public: isPublic,
          });
        }}
      >
        <label>
          Questions in this lobby
          <input
            aria-label="Questions in this lobby"
            type="number"
            min="1"
            max="50"
            required
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </label>
        <label>
          Time per question
          <select
            aria-label="Time per question"
            value={seconds}
            onChange={(event) => setSeconds(event.target.value)}
          >
            {[0, 30, 60, 90, 120, 180, 300, 600].map((value) => (
              <option key={value} value={value}>
                {value ? `${value} seconds` : "Untimed questions"}
              </option>
            ))}
          </select>
        </label>
        <BattleMatchLimit value={totalSeconds} onChange={setTotalSeconds} />
        <label>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setPublic(event.target.checked)}
          />{" "}
          Show in public lobbies
        </label>
        <button className="button button-secondary" disabled={busy}>
          Save lobby settings
        </button>
      </form>
      {room.team_size > 0 && (
        <form
          className="battle-settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitControl("swap", { first, second });
          }}
        >
          <h4>Swap teams</h4>
          <label>
            First player
            <select
              aria-label="First player"
              required
              value={first}
              onChange={(event) => {
                setFirst(event.target.value);
                setSecond("");
              }}
            >
              <option value="">Choose a player</option>
              {room.members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  Player {member.seat} · Team {member.team}
                </option>
              ))}
            </select>
          </label>
          <label>
            Player on the other team
            <select
              aria-label="Player on the other team"
              required
              value={second}
              onChange={(event) => setSecond(event.target.value)}
            >
              <option value="">Choose a player</option>
              {room.members
                .filter(
                  (member) => firstMember && member.team !== firstMember.team,
                )
                .map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    Player {member.seat} · Team {member.team}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="button button-secondary"
            disabled={busy || !first || !second}
          >
            Swap selected players
          </button>
        </form>
      )}
      <h4>Manage players</h4>
      <ul className="battle-member-controls">
        {room.members
          .filter((member) => member.user_id !== room.host_id)
          .map((member) => (
            <li key={member.user_id}>
              <span>
                Player {member.seat}
                {room.team_size ? ` · Team ${member.team}` : ""}
              </span>
              {removing === member.user_id ? (
                <>
                  <span>This player cannot rejoin this lobby.</span>
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await submitControl("kick", { userId: member.user_id })
                      )
                        setRemoving(null);
                    }}
                  >
                    Confirm remove Player {member.seat}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => setRemoving(null)}
                  >
                    Keep player
                  </button>
                </>
              ) : (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => setRemoving(member.user_id)}
                >
                  Remove Player {member.seat}
                </button>
              )}
            </li>
          ))}
      </ul>
    </details>
  );
}
