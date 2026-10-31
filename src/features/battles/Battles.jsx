import Filters from "../learning/Filters.jsx";
import BattleVocabularyFilters from "./BattleVocabularyFilters.jsx";
import BattleHostControls from "./BattleHostControls.jsx";
import BattleTimer from "./BattleTimer.jsx";
import BattleMatchLimit from "./BattleMatchLimit.jsx";
import MatchingChoices, { MatchingPairs } from "./MatchingChoices.jsx";
import { useEffect, useRef, useState } from "react";
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
  const quick = action === "quick-match";
  const payload = { ...data };
  if (quick) delete payload.id;
  const { data: result, error } = await supabase.rpc(
    quick ? "battle_quick_match" : "battle_action",
    quick ? { p_data: payload } : { p_action: action, p_data: data },
  );
  if (error) throw new Error(error.message);
  return result;
}
export default function Battles() {
  const actionPending = useRef(false),
    requestVersion = useRef(0);
  const [room, setRoom] = useState(null),
    [roomId, setRoomId] = useState(storedId),
    [catalog, setCatalog] = useState(null),
    [error, setError] = useState(""),
    [syncError, setSyncError] = useState(""),
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
    totalSeconds: 0,
    public: false,
  });
  useEffect(() => {
    let active = true,
      inFlight = false;
    async function refresh(force = false) {
      if (
        inFlight ||
        actionPending.current ||
        (document.hidden && force !== true)
      )
        return;
      inFlight = true;
      const version = ++requestVersion.current;
      try {
        const result = await rpc(
          roomId ? "state" : "list",
          roomId ? { id: roomId } : {},
        );
        if (active && version === requestVersion.current) {
          if (roomId) setRoom(result);
          else setCatalog(result);
          setOnline(true);
          setSyncError("");
        }
      } catch (e) {
        if (active && version === requestVersion.current) {
          setOnline(false);
          setSyncError(e.message);
        }
      } finally {
        inFlight = false;
      }
    }
    refresh(true);
    const wake = () => {
      if (!document.hidden) refresh(true);
    };
    const offline = () => setOnline(false);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    const channel = roomId
      ? supabase
          .channel(`battle-signals-${roomId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "battle_signals",
              filter: `battle_id=eq.${roomId}`,
            },
            refresh,
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") refresh();
          })
      : null;
    const timer = setInterval(() => refresh(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", offline);
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId]);
  useEffect(() => {
    setResponse("");
  }, [room?.round]);
  async function act(action, data = {}, control = false) {
    if (actionPending.current) return false;
    actionPending.current = true;
    ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      let next;
      if (control) {
        const result = await supabase.rpc("battle_lobby_control", {
          p_action: action,
          p_data: { id: roomId, ...data },
        });
        if (result.error) throw new Error(result.error.message);
        next = result.data;
      } else next = await rpc(action, { id: roomId, ...data });
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
      setSyncError("");
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  const field = (name) => ({
    value: settings[name],
    onChange: (e) =>
      setSettings((s) => ({
        ...s,
        ...(name === "category" ? { filters: {} } : {}),
        [name]: [
          "capacity",
          "teamSize",
          "questionCount",
          "seconds",
          "totalSeconds",
        ].includes(name)
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
      {(error || syncError) && (
        <p className="form-error" role="alert">
          {error || syncError}
        </p>
      )}
      {!online && (
        <div role="status">
          <p>Connection interrupted. Reconnecting to your saved seat…</p>
          {roomId && (
            <button className="button button-secondary" onClick={leaveView}>
              Back to Battles
            </button>
          )}
        </div>
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
                act(
                  e.nativeEvent.submitter?.value === "quick-match"
                    ? "quick-match"
                    : "create",
                  settings,
                );
              }}
            >
              <h2>Create Battle</h2>
              <label>
                Category
                <select aria-label="Category" {...field("category")}>
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
                    aria-label="Vocabulary mode"
                    value={settings.filters?.mode || "meaning-rush"}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        filters: { ...s.filters, mode: e.target.value },
                      }))
                    }
                  >
                    <option value="meaning-rush">Meaning Rush</option>
                    <option value="reverse-meaning">Reverse Meaning</option>
                    <option value="typed-word">Typed Word Challenge</option>
                    <option value="word-matching">Word Matching</option>
                  </select>
                </label>
              )}
              {settings.category === "Vocabulary" &&
                settings.filters?.mode === "word-matching" && (
                  <p>
                    Each matching round uses four distinct stored pairs. Every
                    pair must be correct to earn the round’s 100 points.
                  </p>
                )}
              {settings.category === "Vocabulary" ? (
                <BattleVocabularyFilters
                  value={settings.filters || {}}
                  onChange={(filters) =>
                    setSettings((current) => ({ ...current, filters }))
                  }
                />
              ) : (
                <details>
                  <summary>Question sources, topics and difficulty</summary>
                  <Filters
                    status={false}
                    showSection={false}
                    value={{
                      ...settings.filters,
                      section:
                        settings.category === "Mixed" ? "" : settings.category,
                    }}
                    onChange={(value) => {
                      const filters = { ...value };
                      delete filters.section;
                      setSettings((current) => ({ ...current, filters }));
                    }}
                  />
                </details>
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
                {settings.category === "Vocabulary" &&
                settings.filters?.mode === "word-matching"
                  ? "Matching rounds"
                  : "Questions"}
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  required
                  list="battle-question-counts"
                  {...field("questionCount")}
                />
                <datalist id="battle-question-counts">
                  {[5, 10, 15, 20, 30, 50].map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                <small>
                  Choose 1–50 questions. The server checks the available pool.
                </small>
              </label>
              <label>
                Time per question
                <select {...field("seconds")}>
                  <option value={0}>Untimed questions</option>
                  {[60, 90, 120, 180, 300].map((n) => (
                    <option value={n} key={n}>
                      {n} seconds
                    </option>
                  ))}
                </select>
              </label>
              <BattleMatchLimit
                value={settings.totalSeconds}
                onChange={(totalSeconds) =>
                  setSettings((current) => ({ ...current, totalSeconds }))
                }
              />
              <p>
                Use untimed questions with a whole-match limit for one shared
                timer. It starts after the countdown; unanswered questions earn
                no points.
              </p>
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
              {settings.capacity === 2 && settings.teamSize === 0 && (
                <>
                  <button
                    className="button button-secondary"
                    type="submit"
                    value="quick-match"
                    disabled={busy}
                  >
                    Quick Match
                  </button>
                  <p>
                    Find or open a public 1v1 using these sources, mode and
                    timers. Both players still mark ready before starting.
                  </p>
                </>
              )}
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
                    ? " · Away"
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
                  : "Untimed questions"}{" "}
                · Correct answer: 100 points
              </p>
              {room.total_seconds > 0 && (
                <p>
                  Whole-match limit: {room.total_seconds} seconds, starting
                  after the countdown.
                </p>
              )}
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
                    disabled={
                      busy ||
                      room.members.length < 2 ||
                      room.members.some((member) => !member.ready) ||
                      (room.team_size > 0 &&
                        room.members.length !== room.capacity)
                    }
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
              {host && (
                <BattleHostControls
                  room={room}
                  busy={busy}
                  onControl={(action, data) => act(action, data, true)}
                />
              )}
            </section>
          )}
          {room.state === "COUNTDOWN" && (
            <section className="battle-countdown" role="status">
              <h3>Get ready.</h3>
              <p>The server is starting your shared question set.</p>
              <BattleTimer
                deadline={room.deadline}
                serverNow={room.serverNow}
                label="Starts in"
              />
            </section>
          )}
          {room.match_deadline &&
            ["PLAYING", "ROUND_RESULTS"].includes(room.state) && (
              <BattleTimer
                deadline={room.match_deadline}
                serverNow={room.serverNow}
                label="Match time remaining"
              />
            )}
          {q && ["PLAYING", "ROUND_RESULTS"].includes(room.state) && (
            <section className="card battle-question">
              {(q.passage || q.stimulus || q.image_url || q.stimulus_table) && (
                <Stimulus question={q} />
              )}
              <h3>
                <FormattedText>{q.question_text}</FormattedText>
              </h3>
              {room.deadline &&
                (room.seconds > 0 || room.state === "ROUND_RESULTS") && (
                  <BattleTimer
                    deadline={room.deadline}
                    serverNow={room.serverNow}
                    label={
                      room.state === "ROUND_RESULTS"
                        ? "Next update in"
                        : "Question time remaining"
                    }
                  />
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
                    {q.question_type === "vocabulary-matching" ? (
                      <MatchingChoices
                        question={q}
                        response={response}
                        onChange={setResponse}
                        disabled={busy}
                      />
                    ) : ["open", "vocabulary-typed"].includes(
                        q.question_type,
                      ) ? (
                      <label>
                        {q.question_type === "vocabulary-typed"
                          ? "Type the word"
                          : "Your numerical answer"}
                        <input
                          value={response}
                          onChange={(e) => setResponse(e.target.value)}
                          maxLength={
                            q.question_type === "vocabulary-typed" ? 200 : 6
                          }
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
                  {q.question_type === "vocabulary-matching" ? (
                    <MatchingPairs
                      question={q}
                      mapping={room.review.acceptedAnswers}
                      title="Correct pairs"
                    />
                  ) : (
                    <p>
                      Correct answer:{" "}
                      {["open", "vocabulary-typed"].includes(q.question_type)
                        ? room.review.acceptedAnswers?.join(", ")
                        : "ABCD"[room.review.answer]}
                    </p>
                  )}
                  <p>
                    <FormattedText>{room.review.explanation}</FormattedText>
                  </p>
                  <p>
                    {room.round === room.question_count
                      ? "Final results will appear automatically."
                      : "The next round begins automatically."}
                  </p>
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
                  {h.question.question_type === "vocabulary-matching" ? (
                    <>
                      <MatchingPairs
                        question={h.question}
                        mapping={h.response}
                        title="Your pairs"
                      />
                      <MatchingPairs
                        question={h.question}
                        mapping={h.acceptedAnswers}
                        title="Correct pairs"
                      />
                    </>
                  ) : (
                    <p>
                      Your answer: {h.response ?? "Unanswered"} · Correct:{" "}
                      {h.acceptedAnswers?.join(", ") ?? "ABCD"[h.answer]}
                    </p>
                  )}
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
