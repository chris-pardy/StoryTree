import { createFileRoute, Link } from "@tanstack/react-router";
import { isSafeReturnTo } from "#/server/auth/return-to";
import { getSessionDid } from "#/server/auth/session";

type LoginSearch = {
	returnTo?: string;
};

export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown>): LoginSearch => {
		const raw = typeof search.returnTo === "string" ? search.returnTo : null;
		return { returnTo: raw && isSafeReturnTo(raw) ? raw : undefined };
	},
	component: LoginPage,
	server: {
		handlers: {
			GET: async ({ request, next }) => {
				const did = await getSessionDid(request);
				if (did) {
					const url = new URL(request.url);
					const raw = url.searchParams.get("returnTo");
					const location = raw && isSafeReturnTo(raw) ? raw : "/";
					return new Response(null, {
						status: 302,
						headers: { Location: location },
					});
				}
				return next();
			},
		},
	},
});

function LoginPage() {
	const { returnTo } = Route.useSearch();
	return (
		<main className="reading-column px-6 pb-28 pt-16 sm:pt-24">
			<header className="reading-masthead rise-in">
				<h1 className="masthead-title">Sign in</h1>
				<p className="masthead-lede">
					Enter the handle from your Atmosphere Account. We&rsquo;ll send you to
					your account&rsquo;s host to authorize branchline.
				</p>
			</header>

			<form
				method="post"
				action="/api/auth/login"
				className="login-form rise-in"
				style={{ animationDelay: "180ms" }}
			>
				<label className="login-field">
					<span className="login-label">Handle</span>
					<input
						type="text"
						name="handle"
						required
						autoComplete="username"
						placeholder="alice.test"
						className="login-input"
					/>
				</label>
				{returnTo ? (
					<input type="hidden" name="returnTo" value={returnTo} />
				) : null}
				<button type="submit" className="login-submit">
					Continue →
				</button>
			</form>

			<p className="login-aside rise-in" style={{ animationDelay: "260ms" }}>
				<Link to="/atmosphere" className="login-aside-link">
					Need an account?
				</Link>
			</p>
		</main>
	);
}
