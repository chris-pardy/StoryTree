import { useSuspenseQuery } from "@tanstack/react-query";
import { BudCard } from "#/components/BudCard";
import { authorPlantingsQuery } from "#/queries/author-plantings";

export function AuthorPlantingsList({
	did,
	emptyLabel = "Nothing planted yet.",
}: {
	did: string;
	emptyLabel?: string;
}) {
	const { data: plantings } = useSuspenseQuery(authorPlantingsQuery(did));

	if (plantings.length === 0) {
		return <p className="bloom-feed-empty">{emptyLabel}</p>;
	}

	return (
		<ul className="bloom-grid">
			{plantings.map((planting) => (
				<li key={planting.root}>
					<BudCard uri={planting.root} treeHeight={planting.treeHeight} />
				</li>
			))}
		</ul>
	);
}
