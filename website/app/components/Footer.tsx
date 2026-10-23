import { LICENSE_URL, MAKER_EMAIL, MAKER_NAME, REPO_URL } from "../constants";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__grid">
          <div className="maker">
            <h2>Made by {MAKER_NAME}</h2>
            <p>
              I kept checking my usage again and again. I wanted something cleaner, that showed more
              and was easier to keep an eye on.
            </p>
          </div>
          <nav className="footer__links" aria-label="Project links">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
              Issues
            </a>
            <a href={LICENSE_URL} target="_blank" rel="noreferrer">
              MIT license
            </a>
            <a href={`mailto:${MAKER_EMAIL}`}>Email</a>
          </nav>
        </div>
        <div className="footer__base">
          <span>claudget</span>
          <span>Not affiliated with Anthropic.</span>
        </div>
      </div>
    </footer>
  );
}
