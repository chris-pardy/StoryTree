import { Link } from "@tanstack/react-router";
import LogoMark from "./LogoMark";
import ThemeToggle from "./ThemeToggle";

export default function Header({ did }: { did: string | null }) {
	return (
		<header className="site-masthead">
			<div className="site-masthead-inner">
				<Link to="/" className="site-wordmark">
					<LogoMark />
					<span>branchline</span>
				</Link>
				<div className="site-masthead-actions">
					{did ? (
						<form method="post" action="/api/auth/logout">
							<button type="submit" className="site-auth-button">
								Sign out
							</button>
						</form>
					) : (
						<Link to="/login" className="site-auth-button">
							Sign in
						</Link>
					)}
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}
