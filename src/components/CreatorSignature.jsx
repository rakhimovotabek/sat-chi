import { Link } from "react-router";
import { CREATOR_PORTFOLIO_URL } from "../lib/creator.js";
export default function CreatorSignature() {
  return (
    <span className="creator-signature">
      Made by <Link to={CREATOR_PORTFOLIO_URL}>Franz Hermann</Link>
    </span>
  );
}
