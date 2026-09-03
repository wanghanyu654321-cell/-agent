import { type FormEvent, useEffect, useState } from "react";
import {
	bootstrapSession,
	createSameOriginSessionApi,
	loginAndReloadSession,
	logoutAndClearSession,
	type IdentityContext,
	type SessionState,
} from "./session.ts";
import "./styles.css";

const sessionApi = createSameOriginSessionApi();

export function App() {
	const [session, setSession] = useState<SessionState>({ phase: "bootstrapping" });

	useEffect(() => {
		let active = true;
		void bootstrapSession(sessionApi).then((next) => {
			if (active) setSession(next);
		});
		return () => {
			active = false;
		};
	}, []);

	if (session.phase === "bootstrapping") return <StatusPanel message="Restoring your secure session…" />;
	if (session.phase === "authenticating") return <StatusPanel message="Signing in…" />;
	if (session.phase === "unauthenticated") {
		return <LoginScreen error={session.error} onLogin={async (credentials) => {
			setSession({ phase: "authenticating" });
			setSession(await loginAndReloadSession(sessionApi, credentials));
		}} authenticating={false} />;
	}
	if (session.phase === "session-invalidated") {
		return <LoginScreen error="Your session has expired." onLogin={async (credentials) => {
			setSession({ phase: "authenticating" });
			setSession(await loginAndReloadSession(sessionApi, credentials));
		}} authenticating={false} />;
	}
	return <AuthenticatedShell context={session.context} authorizationError={session.phase === "authorization-error"} onLogout={async () => {
		setSession({ phase: "unauthenticated" });
		setSession(await logoutAndClearSession(sessionApi, session));
	}} />;
}

export function AuthenticatedShell({
	context,
	onLogout,
	authorizationError = false,
}: {
	context: IdentityContext;
	onLogout: () => void | Promise<void>;
	authorizationError?: boolean;
}) {
	return <main className="shell">
		<header className="identity-header">
			<div>
				<p className="eyebrow">Customer Support Agent</p>
				<h1>Support operations</h1>
			</div>
			<button type="button" className="logout" onClick={() => void onLogout()}>Sign out</button>
		</header>
		<section className="context" aria-label="Server-derived identity context">
			<ContextField label="Actor" value={context.actor.userId} />
			<ContextField label="Role" value={context.actor.role} />
			<ContextField label="Capabilities" value={context.actor.capabilities.join(", ")} />
			<ContextField label="Tenant" value={context.scope.tenantId} />
			<ContextField label="Store" value={context.scope.storeId} />
		</section>
		{authorizationError ? <p className="notice" role="status">This action is not authorized for your current server-derived role.</p> : null}
		<section className="coming-next" aria-label="Current product scope">
			<h2>Authenticated shell ready</h2>
			<p>Support workspaces and durable-record views are intentionally not part of this checkpoint.</p>
		</section>
	</main>;
}

function LoginScreen({
	error,
	authenticating,
	onLogin,
}: {
	error?: string;
	authenticating: boolean;
	onLogin: (credentials: { email: string; password: string }) => Promise<void>;
}) {
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		await onLogin({ email: String(fields.get("email") ?? ""), password: String(fields.get("password") ?? "") });
	}
	return <main className="login-page">
		<form className="login-card" onSubmit={(event) => void submit(event)}>
			<p className="eyebrow">Customer Support Agent</p>
			<h1>Sign in to the enterprise shell</h1>
			<p>Identity, role, capabilities, tenant, and store are always supplied by the server.</p>
			<label>Email<input name="email" type="email" autoComplete="email" required /></label>
			<label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
			{error ? <p className="notice" role="alert">{error}</p> : null}
			<button type="submit" disabled={authenticating}>{authenticating ? "Signing in…" : "Sign in"}</button>
		</form>
	</main>;
}

function ContextField({ label, value }: { label: string; value: string }) {
	return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function StatusPanel({ message }: { message: string }) {
	return <main className="login-page"><p className="status">{message}</p></main>;
}
