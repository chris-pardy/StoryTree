import "./Header.css";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Nut } from "lucide-react";
import { useAdminPermissions } from "#/hooks/useAdminPermissions";
import { authorSeedsQuery } from "#/queries/author-seeds";
import LogoMark from "./LogoMark";
import ThemeToggle from "./ThemeToggle";

function SeedLink({ did }: { did: string }) {
	const { data: seeds } = useSuspenseQuery({ ...authorSeedsQuery(did, 1) });
	const { canGrantSeeds } = useAdminPermissions();

	if (!canGrantSeeds && (!seeds || seeds.length === 0)) return null;

	return (
		<Link
			to="/seed"
			aria-label="Your seeds"
			title="Your seeds"
			className="site-seed-link"
		>
			<Nut size={15} strokeWidth={1.6} aria-hidden="true" />
		</Link>
	);
}

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
						<>
							<SeedLink did={did} />
							<form method="post" action="/api/auth/logout">
								<button type="submit" className="site-auth-button">
									Sign out
								</button>
							</form>
						</>
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
