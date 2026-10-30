import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import PageHeader from "../../components/PageHeader.jsx";
import FormattedText from "../../components/FormattedText.jsx";
import QuestionImage from "../../components/QuestionImage.jsx";
import Stimulus from "../player/Stimulus.jsx";
import "./battles.css";
const storedId = () => {
  try {
    return sessionStorage.getItem("satchi-battle");
  } catch {
    return null;
  }
};
async function rpc(action, data = {}) {
  const { data: result, error } = await supabase.rpc("battle_action", {
    p_action: action,
    p_data: data,
  });
  if (error) throw new Error(error.message);
  return result;
}
export default function Battles() {
  const [room, setRoom] = useState(null),
    [roomId, setRoomId] = useState(storedId),
    [catalog, setCatalog] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true),
    [code, setCode] = useState(""),
    [response, setResponse] = useState("");
  const [settings, setSettings] = useState({
    category: "Math",
    capacity: 2,
    teamSize: 0,
    questionCount: 5,
    seconds: 90,
    public: false,
  });
  useEffect(() => {
    let active = true,
      inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await rpc(
          roomId ? "state" : "list",
          roomId ? { id: roomId } : {},
        );
        if (active) {
          if (roomId) setRoom(result);
          else setCatalog(result);
          setOnline(true);
        }
      } catch (e) {
        if (active) {
          setOnline(false);
          setError(e.message);
        }
      } finally {
        inFlight = false;
      }
    }
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [roomId]);
  useEffect(() => {
    setResponse("");
  }, [room?.round]);
  async function act(action, data = {}) {
    setBusy(true);
    setError("");
    try {
      const next = await rpc(action, { id: roomId, ...data });
      if (next.left) {
        setRoom(null);
        setRoomId(null);
        sessionStorage.removeItem("satchi-battle");
      } else if (next.id) {
        setRoom(next);
        setRoomId(next.id);
        sessionStorage.setItem("satchi-battle", next.id);
      }
      setOnline(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const field = (name) => ({
    value: settings[name],
    onChange: (e) =>
      setSettings((s) => ({
        ...s,
        ...(name === "category" ? { filters: {} } : {}),
        [name]: ["capacity", "teamSize", "questionCount", "seconds"].includes(
          name,
        )
          ? Number(e.target.value)
          : e.target.value,
      })),
  });
  const me = room?.members?.find((m) => m.user_id === room.me),
    host = room?.host_id === room?.me,
    q = room?.question;
  function leaveView() {
    setRoomId(null);
    setRoom(null);
    sessionStorage.removeItem("satchi-battle");
  }
  return (
    <div className="battles">
      <PageHeader
        title="Battles"
        description="Same questions. Shared arena. Bring your best thinking."
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!online && (
        <p role="status">
          Connection interrupted. Reconnecting to your saved seat…
        </p>
      )}
      {!roomId ? (
        <>
          <div className="battle-intro">
            <h2>Challenge your next opponent.</h2>
            <p>
              Earn 100 points for a correct answer. No points for a wrong
              answer. Team scores add every member’s points. Battle results stay
              separate from practice and Homework.
            </p>
          </div>
          <div className="battle-home-grid">
            <form
              className="card content-form"
              onSubmit={(e) => {
                e.preventDefault();
                act("create", settings);
              }}
            >
              <h2>Create Battle</h2>
              <label>
                Category
                <select {...field("category")}>
                  <option>Vocabulary</option>
                  <option>Math</option>
                  <option>Reading &amp; Writing</option>
                  <option>Mixed</option>
                </select>
              </label>
              {settings.category === "Vocabulary" && (
                <label>
                  Vocabulary mode
                  <select
                    value={settings.filters?.mode || "meaning-rush"}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        filters: { mode: e.target.value },
                      }))
                    }
                  >
                    <option value="meaning-rush">Meaning Rush</option>
                    <option value="reverse-meaning">Reverse Meaning</option>
                  </select>
                </label>
              )}
              <label>
                Format
                <select
                  value={`${settings.capacity}:${settings.teamSize}`}
                  onChange={(e) => {
                    const [capacity, teamSize] = e.target.value
                      .split(":")
                      .map(Number);
                    setSettings((s) => ({ ...s, capacity, teamSize }));
                  }}
                >
                  {[
                    [2, 0, "1 vs 1"],
                    [4, 2, "2 vs 2"],
                    [6, 3, "3 vs 3"],
                    [4, 0, "Free-for-all · 4"],
                    [10, 0, "Public arena · 10"],
                    [20, 0, "Public arena · 20"],
                  ].map(([n, t, label]) => (
                    <option value={`${n}:${t}`} key={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Questions
                <select {...field("questionCount")}>
                  {[5, 10, 15, 20, 30, 50].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Time per question
                <select {...field("seconds")}>
                  <option value={0}>Untimed friendly</option>
                  {[60, 90, 120, 180, 300].map((n) => (
                    <option value={n} key={n}>
                      {n} seconds
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.public}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, public: e.target.checked }))
                  }
                />
                Public lobby
              </label>
              <button className="button" disabled={busy}>
                Create Battle
              </button>
            </form>
            <section className="card">
              <h2>Join Battle</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act("join", { code: code.trim() });
                }}
              >
                <label>
                  Invitation code
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={10}
                    required
                    autoComplete="off"
                  />
                </label>
                <button className="button" disabled={busy}>
                  Join lobby
                </button>
              </form>
              <h3>Public lobbies</h3>
              {catalog?.lobbies.length ? (
                catalog.lobbies.map((l) => (
                  <button
                    className="battle-lobby"
                    key={l.id}
                    disabled={busy}
                    onClick={() => act("join", { id: l.id })}
                  >
                    <strong>{l.category}</strong>
                    <span>
                      {l.players} / {l.capacity} players · {l.question_count}{" "}
                      questions
                    </span>
                    <span>Join →</span>
                  </button>
                ))
              ) : (
                <p className="empty-copy">
                  No open lobbies yet. Create one and invite a friend.
                </p>
              )}
            </section>
          </div>
          <section className="card">
            <h2>My Battle History</h2>
            {catalog?.history.length ? (
              catalog.history.map((h) => (
                <button
                  className="battle-lobby"
                  key={h.id}
                  onClick={() => act("state", { id: h.id })}
                >
                  <strong>{h.category}</strong>
                  <span>{h.state}</span>
                  <span>{h.score} points</span>
                </button>
              ))
            ) : (
              <p>Your completed battles will appear here.</p>
            )}
          </section>
        </>
      ) : !room ? (
        <p role="status">
          Reconnecting to your battle…{" "}
          <button onClick={leaveView}>Back to Battles</button>
        </p>
      ) : (
        <>
          <div className="battle-room-bar">
            <div>
              <h2>{room.category} arena</h2>
              <p>
                {room.state.replaceAll("_", " ")} · Round {room.round || "—"} /{" "}
                {room.question_count}
              </p>
            </div>
            <div>
              <strong>{room.code}</strong>
              <button
                className="button button-secondary"
                onClick={() =>
                  navigator.clipboard
                    .writeText(room.code)
                    .catch(() =>
                      setError("Copy the displayed invitation code manually."),
                    )
                }
              >
                Copy invite code
              </button>
            </div>
          </div>
          <div className="battle-scoreboard">
            {room.members?.map((m) => (
              <div
                key={m.user_id}
                className={`battle-player team-${m.team % 2}`}
              >
                <span>
                  Player {m.seat}
                  {m.user_id === room.me ? " · You" : ""}
                  {m.user_id === room.host_id ? " · Host" : ""}
                </span>
                <strong>{m.score}</strong>
                <small>
                  {room.team_size ? `Team ${m.team} · ` : ""}
                  {m.ready ? "Ready" : "Not ready"}
                  {Date.parse(room.serverNow) - Date.parse(m.last_seen) > 30000
                    ? " · Disconnected"
                    : ""}
                </small>
              </div>
            ))}
          </div>
          {room.team_size > 0 && (
            <p>
              {[1, 2]
                .map(
                  (team) =>
                    `Team ${team}: ${room.members.filter((m) => m.team === team).reduce((sum, m) => sum + m.score, 0)} points`,
                )
                .join(" · ")}
            </p>
          )}
          {room.state === "LOBBY" && (
            <section className="card">
              <h3>Ready for the challenge?</h3>
              <p>
                {room.members.length} / {room.capacity} players ·{" "}
                {room.seconds
                  ? `${room.seconds} seconds per question`
                  : "Untimed friendly"}{" "}
                · Correct answer: 100 points
              </p>
              <div className="button-row">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => act("ready", { ready: !me?.ready })}
                >
                  {me?.ready ? "Not ready" : "Mark ready"}
                </button>
                {host && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => act("start")}
                  >
                    Start Battle
                  </button>
                )}
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => act("leave")}
                >
                  Leave lobby
                </button>
                {host && (
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => act("cancel")}
                  >
                    Cancel lobby
                  </button>
                )}
              </div>
            </section>
          )}
          {room.state === "COUNTDOWN" && (
            <section className="battle-countdown" role="status">
              <h3>Get ready.</h3>
              <p>The server is starting your shared question set.</p>
            </section>
          )}
          {q && ["PLAYING", "ROUND_RESULTS"].includes(room.state) && (
            <section className="card battle-question">
              <Stimulus question={q} />
              <h3>
                <FormattedText>{q.question_text}</FormattedText>
              </h3>
              {room.deadline && (
                <p>
                  Server time remaining:{" "}
                  {Math.max(
                    0,
                    Math.ceil(
                      (Date.parse(room.deadline) - Date.parse(room.serverNow)) /
                        1000,
                    ),
                  )}{" "}
                  seconds
                </p>
              )}
              {room.state === "PLAYING" &&
                (room.submitted ? (
                  <p role="status">
                    Answer submitted. Waiting for the other players…
                  </p>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      act("answer", { round: room.round, response });
                    }}
                  >
                    {q.question_type === "open" ? (
                      <label>
                        Your numerical answer
                        <input
                          value={response}
                          onChange={(e) => setResponse(e.target.value)}
                          maxLength={6}
                          required
                          inputMode="text"
                        />
                      </label>
                    ) : (
                      <div className="battle-options">
                        {q.options.map((o, i) => (
                          <label key={i} className="battle-choice">
                            <input
                              type="radio"
                              name="battle-answer"
                              value={i}
                              checked={response === String(i)}
                              onChange={(e) => setResponse(e.target.value)}
                              required
                            />
                            <strong>{"ABCD"[i]}</strong>
                            <FormattedText>{o}</FormattedText>
                            {q.option_image_urls?.[i] && (
                              <QuestionImage
                                src={q.option_image_urls[i]}
                                alt={`Option ${"ABCD"[i]}`}
                              />
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                    <button
                      className="button"
                      disabled={busy || response === ""}
                    >
                      Submit answer
                    </button>
                  </form>
                ))}
              {room.review && (
                <div role="status">
                  <h4>Round completed</h4>
                  <p>
                    Correct answer:{" "}
                    {q.question_type === "open"
                      ? room.review.acceptedAnswers?.join(", ")
                      : "ABCD"[room.review.answer]}
                  </p>
                  <p>
                    <FormattedText>{room.review.explanation}</FormattedText>
                  </p>
                  <p>The next round begins automatically.</p>
                </div>
              )}
            </section>
          )}
          {room.state === "FINISHED" && (
            <section className="card">
              <h2>
                {me?.score === Math.max(...room.members.map((m) => m.score))
                  ? "Top of the arena"
                  : "Battle completed"}
              </h2>
              <p>
                {room.history.filter((h) => h.correct).length} /{" "}
                {room.question_count} correct · {me?.score} points
              </p>
              {room.history.map((h) => (
                <details key={h.round}>
                  <summary>
                    Question {h.round} ·{" "}
                    {h.correct ? "Correct" : "Incorrect or unanswered"} ·{" "}
                    {h.points} points
                  </summary>
                  <p>
                    <FormattedText>{h.question.question_text}</FormattedText>
                  </p>
                  <p>
                    Your answer: {h.response ?? "Unanswered"} · Correct:{" "}
                    {h.acceptedAnswers?.join(", ") ?? "ABCD"[h.answer]}
                  </p>
                  <p>
                    <FormattedText>{h.explanation}</FormattedText>
                  </p>
                </details>
              ))}
            </section>
          )}
          {["FINISHED", "CANCELLED", "EXPIRED"].includes(room.state) && (
            <button className="button" onClick={leaveView}>
              Back to Battles
            </button>
          )}
        </>
      )}
    </div>
  );
}
