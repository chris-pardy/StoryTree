import { type Bud, BudCard } from "../BudCard";

export function FreshBudsStrip({ buds }: { buds: Array<Bud> }) {
	if (buds.length === 0) return null;

	return (
		<section className="fresh-buds rise-in" aria-label="Fresh buds">
			<header className="fresh-buds-head">
				<p className="masthead-kicker">Still growing</p>
				<h2 className="fresh-buds-title">Fresh buds on this tree</h2>
			</header>
			<ul className="fresh-buds-grid">
				{buds.map((bud) => (
					<li key={bud.uri}>
						<BudCard bud={bud} />
					</li>
				))}
			</ul>
		</section>
	);
}
