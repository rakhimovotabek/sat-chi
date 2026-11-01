import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import useContent from "../books/useContent.js";
import ContentState from "../books/ContentState.jsx";
import AnimatedValue from "../../components/AnimatedValue.jsx";
export function playerName(member, members = []) {
  const name =
    member.display_name ||
    `Player ${member.user_id.replaceAll("-", "").slice(0, 8)}`;
  return members.filter((m) => m.display_name === name).length > 1
    ? `${name} · ${member.user_id.slice(-4)}`
    : name;
}
export default function BattleLeaderboard() {
  const [period, setPeriod] = useState("all");
  const state = useContent(async () => {
    const { data, error } = await supabase.rpc("battle_leaderboard", {
      p_period: period,
    });
    if (error) throw error;
    return data;
  }, [period]);
  return (
    <section
      className="card learning-panel battle-leaderboard"
      id="battle-leaderboard"
    >
      <header>
        <h2>Battle leaderboard</h2>
        <div
          className="segmented-control"
          role="group"
          aria-label="Leaderboard period"
        >
          {[
            ["all", "All time"],
            ["week", "This week"],
            ["month", "This month"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={value === period}
              onClick={() => setPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <p className="empty-copy">
        Ranked by total Battle points. Ties share rank. UTC periods use match
        creation date. Completed matches require every player’s final-round
        submission; abandoned matches do not count. Battle points are separate
        from study XP.
      </p>
      <ContentState {...state} onRetry={state.reload} />
      {state.data &&
        (state.data.rows.length ? (
          <ol
            aria-label="Battle rankings"
            style={{ listStyle: "none", padding: 0 }}
          >
            {state.data.rows.map((row) => (
              <li
                className="battle-ranking"
                data-self={row.user_id === state.data.me}
                key={row.user_id}
              >
                <span className="rank">{row.rank}</span>
                <div className="identity">
                  <span className="battle-avatar" aria-hidden="true">
                    {row.display_name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <strong>
                      {playerName(row, state.data.rows)}
                      {row.user_id === state.data.me ? " · You" : ""}
                    </strong>
                    <small>
                      {row.matches} played · {row.wins} wins · {row.losses}{" "}
                      losses · {row.draws} draws
                    </small>
                    <small>
                      {row.win_rate}% win rate · {row.accuracy}% accuracy
                    </small>
                  </div>
                </div>
                <div className="points">
                  <AnimatedValue value={row.points} />
                  <small>Battle pts</small>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-copy">
            The arena is yours to open. Complete a competitive Battle to join
            the rankings.
          </p>
        ))}
    </section>
  );
}
