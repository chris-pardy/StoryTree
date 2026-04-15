import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { IfLoggedIn, IfLoggedOut } from "#/components/auth/gates";
import { DUMMY_SEEDS, formatGiftedAt, seedDetailSplat } from "#/seeds/dummy";

export const Route = createFileRoute("/seeds")({ component: SeedsPage });

/**
 * The /seeds listing is an aggregation over many PDSes — "give me every
 * unspent `ink.branchline.seedGrant` whose recipient is me" — so it lives
 * in the AppView. For the dummy period we render a stable hand-rolled list;
 * the real loader will query `SeedGrantNode` filtered by recipient DID and
 * excluding entries that appear in `SeedChainCommit`.
 *
 * Plant/gift UI has moved off this page. Each row links to /seed/$<uri>
 * where the detail page handles verification and (for the holder) the
 * plant + gift actions. That gives every seed a shareable canonical URL.
 */
function SeedsPage() {
	const returnTo = useRouterState({
		select: (s) => s.location.pathname,
	});
	const seeds = DUMMY_SEEDS;

	return (
		<main className="reading-column px-6 pb-28 pt-16 sm:pt-24">
			<IfLoggedOut>
				<header className="reading-masthead rise-in">
					<h1 className="masthead-title">Seeds</h1>
					<p className="masthead-lede">
						Seeds are invitations to start a story on branchline. Sign in to see
						any you&rsquo;ve been gifted.
					</p>
					<p className="masthead-lede">
						<Link to="/login" search={{ returnTo }} className="continue-prompt">
							↳ sign in
						</Link>
					</p>
				</header>
			</IfLoggedOut>

			<IfLoggedIn>
				<header className="reading-masthead rise-in">
					<p className="masthead-kicker">Your seeds</p>
					<h1 className="masthead-title">
						{seeds.length === 0 ? (
							<>No seeds, yet.</>
						) : (
							<>
								{seeds.length} {seeds.length === 1 ? "seed" : "seeds"} to plant.
							</>
						)}
					</h1>
					<p className="masthead-lede">
						A seed is an invitation to start a new story. Open one to plant it —
						turning it into the opening bud of a tree — or gift it on to someone
						else.
					</p>
				</header>

				{seeds.length === 0 ? (
					<p className="seed-empty rise-in" style={{ animationDelay: "160ms" }}>
						When someone gifts you a seed, it will show up here.
					</p>
				) : (
					<ul className="seed-list rise-in" style={{ animationDelay: "160ms" }}>
						{seeds.map((seed) => (
							<li key={seed.uri} className="seed-card">
								<Link
									to="/seed/$"
									params={{ _splat: seedDetailSplat(seed.uri) }}
									className="seed-card-link"
								>
									<div className="seed-card-meta">
										<span className="seed-card-from">
											from <em>{seed.giftedBy}</em>
										</span>
										<span className="seed-card-when">
											{formatGiftedAt(seed.giftedAt)}
										</span>
									</div>
									{seed.note && <p className="seed-card-note">{seed.note}</p>}
									<p className="seed-card-open">open seed →</p>
								</Link>
							</li>
						))}
					</ul>
				)}
			</IfLoggedIn>
		</main>
	);
}
