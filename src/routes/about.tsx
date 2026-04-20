import "./about.css";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Nut, Sparkles, Sprout, Trees } from "lucide-react";
import type { ReactNode } from "react";
import { BloomingNotice } from "#/components/reading/ContinueStory";
import { siteOgMeta } from "#/lib/og-meta";
import { loadSiteMeta } from "#/server/site-meta";

export const Route = createFileRoute("/about")({
	loader: () => loadSiteMeta(),
	head: ({ loaderData }) => ({
		meta: siteOgMeta({
			title: "About · Branchline",
			description:
				"Branchline is a place to grow stories together, one bloom at a time. Each bud is at most 500 words; every reader can write the next.",
			imageUrl: `${loaderData?.publicUrl ?? ""}/og/site.png`,
			pageUrl: `${loaderData?.publicUrl ?? ""}/about`,
		}),
	}),
	component: AboutPage,
});

function LifecycleSection({
	icon,
	title,
	children,
}: {
	icon: ReactNode;
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="lifecycle-section">
			<header className="lifecycle-head">
				<span className="lifecycle-icon" aria-hidden="true">
					{icon}
				</span>
				<h2 className="lifecycle-title">{title}</h2>
			</header>
			{children}
		</section>
	);
}

function AboutPage() {
	const demoBloomsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

	return (
		<main className="reading-column px-6 pb-28 pt-16 sm:pt-24">
			<header className="reading-masthead rise-in">
				<p className="masthead-kicker">What branchline is for</p>
				<h1 className="masthead-title">
					Stories grow
					<br />
					<em>in branches.</em>
				</h1>
				<p className="masthead-lede">
					A place to grow stories together, one bloom at a time. Every story
					moves through the same small lifecycle &mdash; seed, bud, pollen,
					tree.
				</p>
			</header>

			<div className="lifecycle rise-in" style={{ animationDelay: "180ms" }}>
				<LifecycleSection
					icon={<Nut size={18} strokeWidth={1.6} />}
					title="Seed"
				>
					<p>
						Every story starts as a <em>seed</em>. Seeds are <strong>rare</strong>.
						When one finds its way to you, plant it carefully &mdash; whatever you
						write on it becomes the root of every branch that grows from it. If
						nothing is coming to you, pass the seed along to someone else whose
						opening line you&rsquo;d rather read.
					</p>
				</LifecycleSection>

				<LifecycleSection
					icon={<Sprout size={18} strokeWidth={1.6} />}
					title="Bud"
				>
					<p>
						Each bud is short &mdash; at most <strong>500 words</strong>. Small
						enough to write in one sitting, long enough to mean something.
					</p>
					<p>
						For its first <strong>24 hours</strong> a bud is <em>growing</em>:
						visible and readable, but not yet open to be extended. That window
						gives the author and first readers a quiet moment with the bud
						before the next writer picks it up.
					</p>
					<div className="lifecycle-bloom-demo">
						<BloomingNotice bloomsAt={demoBloomsAt} />
					</div>
				</LifecycleSection>

				<LifecycleSection
					icon={<Trees size={18} strokeWidth={1.6} />}
					title="Tree"
				>
					<p>
						Once a bud has bloomed, many branches may grow from it. Each branch
						tells its own story. One rule: you can&rsquo;t continue your own
						bud. A tree is nurtured not by a single author but by the readers
						who pick it up.
					</p>
				</LifecycleSection>

				<LifecycleSection
					icon={<Sparkles size={18} strokeWidth={1.6} />}
					title="Pollen"
				>
					<p>
						Leave pollen on the buds you love to help them reach new readers.
						Pollen shapes the home feed and decays over time, so what you see is
						the writing people are responding to <em>now</em>, not the writing
						that happened to be first.
					</p>
				</LifecycleSection>
			</div>

			<section className="about-outro">
				<p>
					branchline is an AppView over the{" "}
					<a
						href="https://atproto.com/"
						target="_blank"
						rel="noopener noreferrer"
					>
						AT Protocol
					</a>
					. Your buds live in <em>your</em> repo, under a handle you control
					&mdash; read more about the{" "}
					<Link to="/atmosphere">account model</Link> or the{" "}
					<Link to="/policy">policy page</Link>.
				</p>
			</section>
		</main>
	);
}
