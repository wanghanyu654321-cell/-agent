export interface IdentityContext {
	actor: {
		userId: string;
		role: string;
		capabilities: string[];
	};
	scope: {
		tenantId: string;
		storeId: string;
	};
	request: {
		requestId: string;
	};
}

export type SessionState =
	| { phase: "bootstrapping" }
	| { phase: "authenticating" }
	| { phase: "unauthenticated"; error?: string }
	| { phase: "session-invalidated" }
	| { phase: "authenticated"; context: IdentityContext }
	| { phase: "authorization-error"; context: IdentityContext };

export interface SessionApi {
	request(path: string, init?: RequestInit): Promise<Response>;
}

export function createSameOriginSessionApi(): SessionApi {
	return {
		request(path, init = {}) {
			return fetch(path, { ...init, credentials: "same-origin" });
		},
	};
}

export async function bootstrapSession(api: SessionApi): Promise<SessionState> {
	let response: Response;
	try {
		response = await api.request("/api/v1/auth/me");
	} catch {
		return { phase: "unauthenticated", error: "Unable to restore the current session." };
	}
	if (response.status === 401) return { phase: "unauthenticated" };
	if (!response.ok) return { phase: "unauthenticated", error: "Unable to restore the current session." };
	return { phase: "authenticated", context: await identityContext(response) };
}

export async function loginAndReloadSession(
	api: SessionApi,
	credentials: { email: string; password: string },
): Promise<SessionState> {
	let login: Response;
	try {
		login = await api.request("/api/v1/auth/login", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(credentials),
		});
	} catch {
		return { phase: "unauthenticated", error: "Sign-in is unavailable. Try again." };
	}
	if (!login.ok) return { phase: "unauthenticated", error: "Email or password is not valid." };
	return bootstrapSession(api);
}

export function applyAuthenticatedApiStatus(
	state: Extract<SessionState, { phase: "authenticated" }>,
	status: number,
): SessionState {
	if (status === 401) return { phase: "session-invalidated" };
	if (status === 403) return { phase: "authorization-error", context: state.context };
	return state;
}

export async function logoutAndClearSession(api: SessionApi, _state: SessionState): Promise<SessionState> {
	try {
		await api.request("/api/v1/auth/logout", { method: "POST" });
		return { phase: "unauthenticated" };
	} catch {
		return { phase: "unauthenticated", error: "Signed out locally. Server sign-out can be retried." };
	}
}

async function identityContext(response: Response): Promise<IdentityContext> {
	const value: unknown = await response.json();
	if (!isIdentityContext(value)) throw new Error("The server returned an invalid identity context.");
	return value;
}

function isIdentityContext(value: unknown): value is IdentityContext {
	if (!value || typeof value !== "object") return false;
	const context = value as Partial<IdentityContext>;
	return (
		typeof context.actor?.userId === "string" &&
		typeof context.actor.role === "string" &&
		Array.isArray(context.actor.capabilities) &&
		context.actor.capabilities.every((capability) => typeof capability === "string") &&
		typeof context.scope?.tenantId === "string" &&
		typeof context.scope.storeId === "string" &&
		typeof context.request?.requestId === "string"
	);
}
