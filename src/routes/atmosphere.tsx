import "./policy-prose.css";
import { createFileRoute, Link } from "@tanstack/react-router";
import { siteOgMeta } from "#/lib/og-meta";
import { loadSiteMeta } from "#/server/site-meta";

export const Route = createFileRoute("/atmosphere")({
	loader: () => loadSiteMeta(),
	head: ({ loaderData }) => ({
		meta: siteOgMeta({
			title: "One account, the whole atmosphere · Branchline",
			description:
				"Branchline uses an Atmosphere Account — the same identity that powers Bluesky and a growing number of AT Protocol apps. One login, yours to keep.",
			imageUrl: `${loaderData?.publicUrl ?? ""}/og/site.png`,
			pageUrl: `${loaderData?.publicUrl ?? ""}/atmosphere`,
		}),
	}),
	component: AtmospherePage,
});

function AtmospherePage() {
	return (
		<main className="reading-column px-6 pb-28 pt-16 sm:pt-24">
			<header className="reading-masthead rise-in">
				<p className="masthead-kicker">What kind of account is this?</p>
				<h1 className="masthead-title">
					One account.
					<br />
					<em>The whole atmosphere.</em>
				</h1>
				<p className="masthead-lede">
					branchline doesn&rsquo;t have its own sign-up. It uses an{" "}
					<strong>Atmosphere Account</strong> &mdash; the same account that
					powers Bluesky and a growing number of other apps built on the AT
					Protocol. One login, yours to keep, wherever you go.
				</p>
			</header>

			<section
				className="policy-prose rise-in"
				style={{ animationDelay: "180ms" }}
			>
				<h2>The short version</h2>
				<p>
					Think of an Atmosphere Account as a passport. It&rsquo;s an identity
					that belongs to you, not to any single app, and it comes with a{" "}
					<strong>handle</strong> (your name, like{" "}
					<code>alice.bsky.social</code>) and a small corner of the web where
					your writing actually lives. When you sign in to branchline, your
					account&rsquo;s host asks whether you&rsquo;d like to let branchline
					read and write on your behalf. Say yes, and you&rsquo;re in.
				</p>
				<p>
					The same account works in Bluesky, in other reading and writing apps,
					in feed builders, in image hosts &mdash; anything built on the
					protocol. If branchline disappears tomorrow, your words don&rsquo;t.
					They live with you.
				</p>

				<h2>Why it&rsquo;s set up this way</h2>
				<p>
					On most platforms, your account belongs to the platform. If they go
					away, change the rules, or decide they&rsquo;d rather not host you,
					your writing goes with them. The atmosphere inverts that: your
					identity and your writing live in <em>your</em> account, and apps like
					branchline are just windows onto it. No single company decides what
					you can take with you when you leave.
				</p>

				<h2>Where to get one</h2>
				<p>There are three common paths, from easiest to most involved.</p>
				<p>
					<strong>Sign up through an app.</strong> Some apps double as account
					hosts &mdash; when you make an account there, you&rsquo;re also making
					an Atmosphere Account that works everywhere else. The most popular
					today is{" "}
					<a
						href="https://bsky.app"
						target="_blank"
						rel="noreferrer noopener"
						className="atmosphere-inline-link"
					>
						Bluesky
					</a>
					. Free, takes a minute, and the handle you pick there works here
					without any extra setup.
				</p>
				<p>
					<strong>Use an independent provider.</strong> A small but growing
					number of hosts exist only to hold Atmosphere Accounts &mdash;
					they&rsquo;re not apps themselves. Some are community-run, some lean
					on privacy, some are built around a particular domain you&rsquo;d like
					to use for your handle. If you&rsquo;d rather your account not live on
					Bluesky&rsquo;s infrastructure, this is the route.
				</p>
				<p>
					<strong>Run your own.</strong> If you&rsquo;re technical and want full
					control, you can run the host software yourself on your own server.
					The protocol is open; anyone can be a provider. Your handle can be
					(and probably should be) a domain you already own.
				</p>
				<p>
					Whichever path you pick, the account works the same way in branchline.
					The sign-in flow is always: type your handle, approve the consent
					screen on your host, come back here. branchline never sees your
					password &mdash; it only ever talks to your host through the tokens
					you grant it.
				</p>

				<h2>What branchline can and can&rsquo;t do with it</h2>
				<p>
					When you sign in, your host shows you a consent screen listing exactly
					which collections branchline is asking for. We only ever ask for the
					ones we need to publish your buds and pollen, and (optionally) to
					crosspost to Bluesky. We can&rsquo;t read your DMs, your follows, or
					anything else &mdash; the protocol won&rsquo;t let us, and we never
					asked. The full breakdown lives on the{" "}
					<Link to="/policy" className="atmosphere-inline-link">
						policy page
					</Link>
					.
				</p>

				<h2>Ready?</h2>
				<p>
					Once you have a handle, head back to{" "}
					<Link to="/login" className="atmosphere-inline-link">
						the sign-in page
					</Link>{" "}
					and type it in.
				</p>

				<h2>More on the atmosphere itself</h2>
				<p>
					If you want the bigger picture &mdash; what the atmosphere is, which
					apps already exist in it, why anyone&rsquo;s building this &mdash; a
					good canonical explainer lives at{" "}
					<a
						href="https://atmosphereaccount.com"
						target="_blank"
						rel="noreferrer noopener"
						className="atmosphere-inline-link"
					>
						atmosphereaccount.com
					</a>
					. We won&rsquo;t try to outdo it here.
				</p>
			</section>
		</main>
	);
}
