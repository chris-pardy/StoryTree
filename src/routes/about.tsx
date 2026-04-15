import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({ component: AboutPage });

function AboutPage() {
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
					It&rsquo;s a place to grow stories together, one bloom at a time.
				</p>
			</header>

			<section
				className="policy-prose rise-in"
				style={{ animationDelay: "180ms" }}
			>
				<h2>The idea</h2>
				<p>
					A story on branchline starts as a <em>seed</em> — a short opening bud,
					hand-picked, with nothing after it. From that seed, the story grows.
					Anyone can read a path of buds down from the seed, and any logged-in
					reader can extend the latest bloom on that path by writing the next
					bud themselves. When two writers extend the same bloom, the story
					branches, and both versions live on.
				</p>
				<p>
					Each bud is at most <strong>500 words</strong>. That cap is the whole
					game: small enough to write in one sitting, small enough to read on
					impulse, small enough that a stranger&rsquo;s contribution
					doesn&rsquo;t feel like a hijack. A story isn&rsquo;t a novel one
					person is grinding through — it&rsquo;s a shared garden of paths, some
					long, some short, some abandoned, some still growing tonight.
				</p>

				<h2>Reading a bloom</h2>
				<p>
					A <em>bloom</em> is a bud that&rsquo;s ready to be followed — past its
					growing window and still open for the next writer to extend. Reading
					on branchline means picking a bloom and walking the path of ancestor
					buds above it, from the seed down to the bloom itself — a linear
					sequence of buds by (usually) several different authors, stitched
					together by the choices earlier readers-turned-writers made along the
					way. The home feed surfaces the blooms that are open right now: the
					ones readers are pollinating, the paths that are still open to be
					extended.
				</p>

				<h2>Writing the next bud</h2>
				<p>
					When you finish reading a bloom you can keep going. The bloom you just
					read becomes the parent of whatever you write next. Two simple rules
					shape the pacing:
				</p>
				<ul>
					<li>
						<strong>A 24-hour growing window.</strong> A bud can&rsquo;t be
						built on for the first day after it&rsquo;s written. That gives its
						author and its first readers a quiet moment with it before anyone
						else takes the next step.
					</li>
					<li>
						<strong>No back-to-back self-replies.</strong> You can&rsquo;t
						extend your own bud directly. Two authors can ping-pong, but no one
						writes a whole novel under one handle. The form insists on company.
					</li>
				</ul>
				<p>
					Together these rules turn writing into something closer to
					conversation than to authorship — you make a move, then you wait to
					see who answers.
				</p>

				<h2>Pollen</h2>
				<p>
					Pollen is the only signal branchline asks for. One grain per reader
					per bud, no scores, no axes. Pollen feeds the bloom ranking on the
					home feed and decays over time, so what you see is the writing readers
					are responding to <em>now</em>, not the writing that happened to be
					first.
				</p>

				<h2>Built on the AT Protocol</h2>
				<p>
					branchline is an AppView over the{" "}
					<a
						href="https://atproto.com/"
						target="_blank"
						rel="noopener noreferrer"
					>
						AT Protocol
					</a>
					. You sign in with your existing atproto handle (your Bluesky account
					works), and every bud you write is stored as a record in <em>your</em>{" "}
					repository, on your PDS, under a DID you control. branchline indexes
					those records so other people can find and read them, but the
					canonical copy is always yours. If you delete a bud from your repo, it
					falls out of the index. If branchline disappears tomorrow, your
					writing doesn&rsquo;t.
				</p>
				<p>
					For the full breakdown of what branchline stores, what it asks
					permission for, and what it never touches, see the{" "}
					<a href="/policy">policy page</a>.
				</p>

				<h2>Where this is going</h2>
				<p>
					branchline is in early development. The seed list is small and
					hand-curated. The ranking is a first pass. Bookmarks, follows, and
					per-story feeds are on the way. The shape of the form — short buds,
					branching trees, shared authorship — is the part that&rsquo;s settled.
					Everything around it is still being written, which feels like the
					right way to build something about writing together.
				</p>
			</section>
		</main>
	);
}
