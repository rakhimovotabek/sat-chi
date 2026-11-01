import { Link } from "react-router";
import PageHeader from "../../components/PageHeader.jsx";
import BattleLeaderboard from "./BattleLeaderboard.jsx";
export default function BattleRankings() {
  return (
    <>
      <PageHeader
        title="The Battle standings"
        description="Good thinking earns its place. Your competitive record, separate from study XP."
      />
      <Link className="primary-link" to="/battles">
        ← Back to the arena
      </Link>
      <BattleLeaderboard />
    </>
  );
}
