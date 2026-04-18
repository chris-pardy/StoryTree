import "./Bud.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthorLink } from "#/components/AuthorLink";
import { useViewerDid } from "#/components/auth/gates";
import { BranchLink } from "#/components/BranchLink";
import { DotPulse } from "#/components/DotPulse";
import { PollenButton } from "#/components/PollenButton";
import { budQuery } from "#/queries/buds";
import { queryKeys } from "#/queries/keys";
import { BskyCrosspostPrompt } from "./BskyCrosspostPrompt";
import { BudProse } from "./BudProse";

const dateFmt = new Intl.DateTimeFormat("en-US", {
	month: "long",
	day: "numeric",
	year: "numeric",
});

export function Bud({
	uri,
	ancestors,
	sharing,
	onToggleShare,
}: {
	uri: string;
	ancestors?: string[];
	sharing?: boolean;
	onToggleShare?: (uri: string) => void;
}) {
	const viewer = useViewerDid();
	const queryClient = useQueryClient();
	const { data: bud } = useQuery(budQuery(uri, ancestors));

	const ancestorsReady =
		!ancestors ||
		ancestors.every((a) => queryClient.getQueryData(queryKeys.bud(a)));

	if (!ancestorsReady) return null;
	if (!bud) return <DotPulse />;

	return (
		<>
			<article className="story">
				<div className="story-prose">
					<BudProse text={bud.text} formatting={bud.formatting} />
				</div>
				<footer className="byline">
					<div className="byline-attribution">
						<span className="byline-dash" aria-hidden="true">
							—
						</span>
						<AuthorLink
							did={bud.author?.did}
							handle={bud.author?.handle}
							displayName={bud.author?.displayName}
							className="byline-handle"
						/>
						<span className="byline-sep" aria-hidden="true">
							·
						</span>
						<time dateTime={bud.createdAt}>
							{dateFmt.format(new Date(bud.createdAt))}
						</time>
					</div>
					<div className="byline-actions">
						<BranchLink bud={bud} />
						<PollenButton bud={bud} />
						{viewer && (
							<button
								type="button"
								className="share-button"
								aria-label="Share on Bluesky"
								title="Share on Bluesky"
								aria-pressed={sharing}
								onClick={() => onToggleShare?.(uri)}
							>
								<svg
									viewBox="0 0 600 530"
									xmlns="http://www.w3.org/2000/svg"
									aria-hidden="true"
									focusable="false"
									width={13}
									height={13}
								>
									<path
										fill="currentColor"
										d="M135.7 44.2C202.6 94.4 274.6 195.9 301 250.4c26.4-54.5 98.4-156 165.3-206.2C514.6 7.9 592.8-20.2 592.8 69c0 17.8-10.2 149.5-16.2 170.9-20.8 74.3-96.6 93.3-164 81.8 117.8 20 147.8 86.4 83.1 152.8-122.9 126-176.6-31.6-190.4-72C303 396.6 301.1 390.7 301 395.7c-.1-5-2 .9-4.3 7.8-13.8 40.4-67.5 198-190.4 72-64.7-66.4-34.7-132.8 83.1-152.8-67.4 11.5-143.2-7.5-164-81.8C19.4 219.5 9.2 87.8 9.2 70 9.2-19.2 87.4 8.9 135.7 44.2z"
									/>
								</svg>
							</button>
						)}
					</div>
				</footer>
			</article>
			{sharing && <BskyCrosspostPrompt budUri={bud.uri} budTitle={bud.title} />}
		</>
	);
}
