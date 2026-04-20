import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getPublicUrl } from "../config";
import { getSessionDid } from "./session";

export const fetchSessionInfo = createServerFn({ method: "GET" }).handler(
	async () => {
		const did = await getSessionDid(getRequest());
		return { did, publicUrl: getPublicUrl() };
	},
);
