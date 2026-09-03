import { type FormEvent, useEffect, useRef, useState } from "react";
import {
	bootstrapSession,
	createSameOriginSessionApi,
	loginAndReloadSession,
	logoutAndClearSession,
	type IdentityContext,
	type SessionApi,
	type SessionState,
} from "./session.ts";
import {
	SupportRequestLifecycle,
	submitSupportRequest,
	type PublicSupportResult,
	type SupportRequestInput,
} from "./support.ts";
import {
	BusinessReadLifecycle,
	loadScopedBusinessProof,
	type ScopedHandoff,
	type ScopedTicket,
} from "./business.ts";
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
	const identityKey = `${session.context.actor.userId}:${session.context.scope.tenantId}:${session.context.scope.storeId}`;
	return <AuthenticatedShell
		key={identityKey}
		context={session.context}
		authorizationError={session.phase === "authorization-error"}
		onSessionInvalidated={() => {
			setSession((current) => ("context" in current ? { phase: "session-invalidated" } : current));
		}}
		onAuthorizationError={() => {
			setSession((current) =>
				"context" in current ? { phase: "authorization-error", context: current.context } : current,
			);
		}}
		onLogout={async () => {
			setSession({ phase: "unauthenticated" });
			setSession(await logoutAndClearSession(sessionApi, session));
		}}
	/>;
}

export function AuthenticatedShell({
	context,
	onLogout,
	onSessionInvalidated,
	onAuthorizationError,
	authorizationError = false,
	api = sessionApi,
}: {
	context: IdentityContext;
	onLogout: () => void | Promise<void>;
	onSessionInvalidated?: () => void;
	onAuthorizationError?: () => void;
	authorizationError?: boolean;
	api?: SessionApi;
}) {
	const [businessProof, setBusinessProof] = useState<BusinessProofState>({ status: "loading" });
	const refreshRequest = useRef(new BusinessReadLifecycle());
	const refreshBusinessProof = async () => {
		const current = refreshRequest.current.begin();
		setBusinessProof({ status: "loading" });
		const outcome = await loadScopedBusinessProof(api, context.scope);
		if (!refreshRequest.current.complete(current)) return;
		if (outcome.kind === "success") {
			setBusinessProof({ status: "verified", tickets: outcome.tickets, handoffs: outcome.handoffs });
			return;
		}
		setBusinessProof({ status: "unavailable" });
		if (outcome.kind === "session-invalidated") return onSessionInvalidated?.();
		if (outcome.kind === "forbidden") return onAuthorizationError?.();
	};
	useEffect(() => {
		void refreshBusinessProof();
		return () => refreshRequest.current.invalidate();
	}, [context.scope.tenantId, context.scope.storeId]);
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
		<SupportWorkspace
			api={api}
			tickets={businessProof.status === "verified" ? businessProof.tickets : []}
			handoffs={businessProof.status === "verified" ? businessProof.handoffs : []}
			onCompleted={() => void refreshBusinessProof()}
			 onAuthorizationError={onAuthorizationError ?? (() => undefined)}
			onSessionInvalidated={onSessionInvalidated ?? (() => undefined)}
		/>
		<BusinessProofSurface state={businessProof} />
	</main>;
}

export function SupportWorkspace({
	api,
	tickets,
	handoffs,
	onCompleted,
	onSessionInvalidated,
	onAuthorizationError,
}: {
	api: SessionApi;
	tickets: ScopedTicket[];
	handoffs: ScopedHandoff[];
	onCompleted: () => void;
	onSessionInvalidated: () => void;
	onAuthorizationError: () => void;
}) {
	const lifecycle = useRef(new SupportRequestLifecycle());
	const [form, setForm] = useState<SupportRequestInput>({ conversationId: "", customerId: "", text: "" });
	const [submitted, setSubmitted] = useState<SupportRequestInput>();
	const [result, setResult] = useState<PublicSupportResult>();
	const [error, setError] = useState<string>();
	const [pending, setPending] = useState(false);

	useEffect(() => () => lifecycle.current.invalidate(), []);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const request = lifecycle.current.begin();
		if (request === undefined) return;
		const snapshot = { ...form, conversationId: form.conversationId.trim(), customerId: form.customerId.trim(), text: form.text.trim() };
		setPending(true);
		setSubmitted(snapshot);
		setResult(undefined);
		setError(undefined);
		const outcome = await submitSupportRequest(api, snapshot);
		if (!lifecycle.current.complete(request)) return;
		setPending(false);
		if (outcome.kind === "success") {
			setResult(outcome.result);
			onCompleted();
			return;
		}
		if (outcome.kind === "session-invalidated") return onSessionInvalidated();
		if (outcome.kind === "forbidden") {
			setError("This support action is not authorized for your current server-derived role.");
			return onAuthorizationError();
		}
		setError(outcome.message);
	}

	return <section className="support-workspace" aria-label="Support Proof Workspace">
		<div className="workspace-heading">
			<div>
				<p className="eyebrow">Support proof workspace</p>
				<h2>Customer request</h2>
			</div>
			<p>Only request identifiers and customer text are sent. Authority remains server-derived.</p>
		</div>
		<form className="support-form" onSubmit={(event) => void submit(event)}>
			<label>Conversation ID<input required value={form.conversationId} onChange={(event) => setForm({ ...form, conversationId: event.target.value })} /></label>
			<label>Customer ID<input required value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} /></label>
			<label className="request-text">Customer request<textarea required value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} /></label>
			<button type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit support request"}</button>
		</form>
		{error ? <p className="notice" role="alert">{error}</p> : null}
		{pending ? <p className="status" role="status">Submitting the customer request…</p> : null}
		{submitted && result ? <SupportResultPanel submitted={submitted} result={result} tickets={tickets} handoffs={handoffs} /> : null}
	</section>;
}

export function SupportResultPanel({
	submitted,
	result,
	tickets = [],
	handoffs = [],
}: {
	submitted: SupportRequestInput;
	result: PublicSupportResult;
	tickets?: ScopedTicket[];
	handoffs?: ScopedHandoff[];
}) {
	const explanation = result.type === "answer"
		? result.evidence.length > 0
			? "Governed answer"
			: "Answer"
		: result.type === "fallback"
			? "Controlled fallback"
			: "Escalation";
	return <section className="support-result" aria-label="Latest completed support turn">
		<div className="result-heading"><p className="eyebrow">Latest completed turn</p><span className={`outcome outcome-${result.type}`}>{result.type}</span></div>
		<div className="result-grid">
			<section><h3>Request</h3><dl><ContextField label="Conversation" value={submitted.conversationId} /><ContextField label="Customer" value={submitted.customerId} /><ContextField label="Text" value={submitted.text} /></dl></section>
			<section><h3>Outcome</h3><p className="explanation">{explanation}</p><p className="result-text">{result.text}</p></section>
			<section><h3>Authorized evidence</h3>{result.evidence.length === 0 ? <p>No authorized evidence returned in the final result.</p> : <ul>{result.evidence.map((reference) => <li key={`${reference.id}:${reference.version}`}><strong>{reference.id}</strong><span>{reference.kind} · {reference.version}</span><code>{reference.sourceRef}</code></li>)}</ul>}</section>
			<section><h3>Tools called</h3>{result.toolsCalled.length === 0 ? <p>No customer-facing tools were called.</p> : <ul>{result.toolsCalled.map((tool, index) => <li key={`${tool}-${index}`}>Tool invoked: {tool}</li>)}</ul>}</section>
			<section><h3>Durable business proof</h3><DurableTurnProof conversationId={submitted.conversationId} tickets={tickets} handoffs={handoffs} /></section>
		</div>
	</section>;
}

function DurableTurnProof({ conversationId, tickets, handoffs }: { conversationId: string; tickets: ScopedTicket[]; handoffs: ScopedHandoff[] }) {
	const ticket = tickets.find((item) => item.conversationId === conversationId);
	const handoff = handoffs.find((item) => item.conversationId === conversationId);
	if (!ticket && !handoff) return <p>No matching durable business record confirmed.</p>;
	return <ul>{ticket ? <li>Durable Ticket confirmed by scoped read-back</li> : null}{handoff ? <li>{handoff.reason.startsWith("qualified_professional_required:") ? "Safety-mandated professional handoff" : "Ordinary human handoff"} confirmed by scoped read-back</li> : null}</ul>;
}

export type BusinessProofState =
	| { status: "loading" }
	| { status: "unavailable" }
	| { status: "verified"; tickets: ScopedTicket[]; handoffs: ScopedHandoff[] };

export function BusinessProofSurface({ state }: { state: BusinessProofState }) {
	if (state.status === "loading") return <section className="business-proof" aria-label="Scoped durable business state"><h2>Durable business state</h2><p>Loading durable business state…</p></section>;
	if (state.status === "unavailable") return <section className="business-proof" aria-label="Scoped durable business state"><h2>Durable business state</h2><p>Durable business state could not be verified.</p></section>;
	return <section className="business-proof" aria-label="Scoped durable business state"><h2>Durable business state</h2><p>{state.tickets.length} ticket(s) and {state.handoffs.length} handoff(s) confirmed by scoped read-back.</p><section><h3>Tickets</h3>{state.tickets.length === 0 ? <p>No durable Tickets confirmed.</p> : <ul>{state.tickets.map((ticket) => <li key={ticket.id}><strong>{ticket.id}</strong><span>{ticket.conversationId} · {ticket.summary}</span><code>{ticket.idempotencyKey}</code><time>{ticket.createdAt}</time></li>)}</ul>}</section><section><h3>Handoffs</h3>{state.handoffs.length === 0 ? <p>No durable Handoffs confirmed.</p> : <ul>{state.handoffs.map((handoff) => <li key={handoff.id}><strong>{handoff.id}</strong><span>{handoff.conversationId} · {handoff.reason.startsWith("qualified_professional_required:") ? "Safety-mandated professional handoff" : "Ordinary human handoff"}</span><time>{handoff.createdAt}</time></li>)}</ul>}</section></section>;
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
