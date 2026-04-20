import "./policy-prose.css";
import { createFileRoute } from "@tanstack/react-router";
import { siteOgMeta } from "#/lib/og-meta";
import { loadSiteMeta } from "#/server/site-meta";

export const Route = createFileRoute("/policy")({
	loader: () => loadSiteMeta(),
	head: ({ loaderData }) => ({
		meta: siteOgMeta({
			title: "Policy · Branchline",
			description:
				"How Branchline handles your writing: your words live in your atproto repository. We index them so others can read them.",
			imageUrl: `${loaderData?.publicUrl ?? ""}/og/site.png`,
			pageUrl: `${loaderData?.publicUrl ?? ""}/policy`,
		}),
	}),
	component: PolicyPage,
});

function PolicyPage() {
	return (
		<main className="reading-column px-6 pb-28 pt-16 sm:pt-24">
			<header className="reading-masthead rise-in">
				<p className="masthead-kicker">How branchline handles your writing</p>
				<h1 className="masthead-title">
					Your words,
					<br />
					<em>your repository.</em>
				</h1>
				<p className="masthead-lede">
					branchline is an AppView over the AT Protocol. We don&rsquo;t own your
					posts. We index them so other people can read them.
				</p>
			</header>

			<section
				className="policy-prose rise-in"
				style={{ animationDelay: "180ms" }}
			>
				<h2>Who owns what</h2>
				<p>
					Everything you write through branchline is stored in <em>your</em>{" "}
					atproto repository, on your PDS, under a DID you control. We
					don&rsquo;t hold the canonical copy. If you delete a bud from your
					repo, it&rsquo;s gone — we only ever held a reflection of it.
				</p>

				<h2>What you grant us</h2>
				<p>
					By signing in and writing through branchline, you grant us permission
					to{" "}
					<strong>
						display your <code>ink.branchline.*</code> records on the public web
					</strong>{" "}
					through this site and its AppView — including the text, your handle,
					your DID, and timestamps. Without that permission there&rsquo;s
					nothing to read, so it&rsquo;s the core of the deal.
				</p>
				<p>
					You also grant us permission to write records on your behalf to the
					collections you authorized during sign-in. Today that&rsquo;s:
				</p>
				<ul>
					<li>
						<code>ink.branchline.seed</code> — the seeds you plant as the root
						of a new story, or pass along to someone else
					</li>
					<li>
						<code>ink.branchline.bud</code> — the buds (story contributions) you
						write
					</li>
					<li>
						<code>ink.branchline.pollen</code> — the pollen you leave on other
						people&rsquo;s buds
					</li>
					<li>
						<code>app.bsky.feed.post</code> — only when you explicitly opt in to
						crosspost a bud to Bluesky
					</li>
				</ul>
				<p>
					We never write to a collection you didn&rsquo;t authorize. You can
					revoke our access at any time from your PDS, and you can see exactly
					what we asked for on the sign-in consent screen.
				</p>

				<h2>What we store on our side</h2>
				<p>
					branchline runs an AppView, which means we read the atproto firehose
					and keep an index of <code>ink.branchline.*</code> records so pages
					render quickly and threading works. That index contains only
					information that is already publicly readable through your PDS. We
					also store a short-lived session cookie so we know it&rsquo;s still
					you between page loads, and the OAuth tokens needed to publish on your
					behalf when you ask us to.
				</p>

				<h2>What we don&rsquo;t do</h2>
				<ul>
					<li>We don&rsquo;t sell your data.</li>
					<li>
						We don&rsquo;t share it with advertisers, trackers, or analytics
						brokers.
					</li>
					<li>
						We don&rsquo;t train models on your writing or hand it to third
						parties who do.
					</li>
					<li>
						We don&rsquo;t read your DMs, email, or any records outside the
						collections listed above — we never asked for permission to, and the
						protocol won&rsquo;t let us.
					</li>
				</ul>

				<h2>Taking it back</h2>
				<p>
					If you want branchline to forget you, delete your{" "}
					<code>ink.branchline.*</code> records from your PDS and revoke our
					OAuth session. The firehose will tell our indexer, and those records
					will fall out of our AppView. Your atproto account itself isn&rsquo;t
					ours to delete — it lives on your PDS and belongs to you.
				</p>
				<p>
					One caveat: branchline is a shared tree. When a bud you wrote already
					has writers extending it, the text of that bud is load-bearing for
					their work — it&rsquo;s what they read and replied to. Deleting it
					takes your byline off the bud, which becomes <em>Anonymous</em>, but
					the words themselves stay in place so the path still reads. If you
					need the text itself removed, reach out — see{" "}
					<strong>Contact</strong>, below.
				</p>

				<h2>Contact</h2>
				<p>
					Questions, concerns, or a record you&rsquo;d like taken down? Reach
					us on Bluesky.
				</p>
			</section>
		</main>
	);
}
