import { getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";

const rootApi = getRouteApi("__root__");

export function useViewerDid(): string | null {
	const { did } = rootApi.useLoaderData();
	return did ?? null;
}

export function IfLoggedIn({ children }: { children: ReactNode }) {
	return useViewerDid() ? children : null;
}

export function IfLoggedOut({ children }: { children: ReactNode }) {
	return useViewerDid() ? null : children;
}

export function IfViewer({
	did,
	children,
}: {
	did: string | null | undefined;
	children: ReactNode;
}) {
	const viewer = useViewerDid();
	return viewer && did && viewer === did ? children : null;
}

export function IfNotViewer({
	did,
	children,
}: {
	did: string | null | undefined;
	children: ReactNode;
}) {
	const viewer = useViewerDid();
	return viewer && did && viewer === did ? null : children;
}
