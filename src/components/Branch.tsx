import {
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useCallback, useRef, useState } from "react";
import { BranchMasthead } from "#/components/reading/BranchMasthead";
import { useReadingPosition } from "#/hooks/useReadingPosition";
import { parseBudSplat } from "#/lib/bud-uri";
import { branchQuery } from "#/queries/branch";
import { budQuery } from "#/queries/buds";
import { queryKeys } from "#/queries/keys";
import { BloomCarousel } from "./BloomCarousel";
import { DotPulse } from "./DotPulse";
import { Bud } from "./reading/Bud";
import { ContinueStory } from "./reading/ContinueStory";

export function Branch({ uri }: { uri: string }) {
	const { data: budUris } = useSuspenseQuery(branchQuery(uri));
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const rootUri = budUris[0];
	const mastheadRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLOListElement>(null);
	const [sharingUri, setSharingUri] = useState<string | null>(null);
	const { data: leafBud } = useQuery(budQuery(uri));

	const onToggleShare = useCallback((budUri: string) => {
		setSharingUri((prev) => (prev === budUri ? null : budUri));
	}, []);

	useReadingPosition(mastheadRef, listRef, rootUri ?? "", budUris);

	if (!rootUri) return null;

	const allBudsLoaded = budUris.every((budUri) =>
		queryClient.getQueryData(queryKeys.bud(budUri)),
	);

	return (
		<>
			<div ref={mastheadRef}>
				<BranchMasthead rootUri={rootUri} leafUri={uri} />
			</div>

			<ol className="reading-list" ref={listRef}>
				{budUris.map((budUri, i) => (
					<li key={budUri} data-bud-uri={budUri}>
						<Bud
							uri={budUri}
							ancestors={budUris.slice(0, i)}
							sharing={sharingUri === budUri}
							onToggleShare={onToggleShare}
						/>
					</li>
				))}
			</ol>

			{allBudsLoaded && leafBud && (
				<ContinueStory
					parentUri={uri}
					parentAuthor={leafBud.author?.did}
					onPublished={(newUri) => {
						// Seed the reading-position so the new branch mounts scrolled
						// to the freshly-published bud (the hook picks the last entry
						// in this path that exists in the new branch's budUris).
						try {
							localStorage.setItem(
								`ink.branchline.readingPosition-${rootUri}`,
								JSON.stringify([...budUris, newUri]),
							);
						} catch {}
						// The parent's cached `children` is now stale; drop it so the
						// carousel and branch indicators pick up the new child when
						// the user navigates back.
						queryClient.invalidateQueries({ queryKey: queryKeys.bud(uri) });
						navigate({
							to: "/bud/$",
							params: { _splat: parseBudSplat(newUri) },
						});
					}}
				/>
			)}

			{allBudsLoaded && (
				<Suspense fallback={<DotPulse />}>
					<BloomCarousel rootUri={rootUri} budUri={uri} />
				</Suspense>
			)}
		</>
	);
}
