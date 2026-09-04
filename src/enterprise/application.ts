import { once } from "node:events";
import type { Server } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { Pool } from "pg";
import type { SupportRuntimePort } from "../http-api.ts";
import {
	InMemorySupportStore,
	SupportAgentRuntime,
	type SupportBusinessStore,
	type SupportRequest,
	type SupportResult,
} from "../index.ts";
import { GovernedKnowledgeRetrievalService } from "../knowledge.ts";
import { portfolioDemoFaq, portfolioDemoKnowledge } from "../portfolio-demo-data.ts";
import { EnterpriseAuthService } from "./auth.ts";
import { type EnterpriseBusinessRepository, EnterpriseSupportService } from "./business.ts";
import { type PortfolioEnterpriseDemoData, seedPortfolioEnterpriseDemoData } from "./demo-data.ts";
import { createEnterpriseHttpServer } from "./http-api.ts";
import { bootstrapPiEnterpriseRuntimeFactory } from "./pi-runtime.ts";
import {
	applyEnterpriseBusinessMigrations,
	PostgresEnterpriseBusinessRepository,
	PostgresIdentityRepository,
} from "./postgres.ts";

export interface EnterpriseApplicationConfig {
	databaseUrl: string;
	host: string;
	port: number;
}

export type EnterpriseRuntimeMode = "deterministic" | "pi-real";

export interface EnterpriseRuntimeModeConfig {
	mode: EnterpriseRuntimeMode;
	providerId?: string;
	modelId?: string;
}

export interface EnterpriseRuntimeResource {
	runtime: SupportRuntimePort;
	close?(): Promise<void> | void;
}

export type EnterpriseRuntimeFactory = (businessStore: EnterpriseBusinessRepository) => EnterpriseRuntimeResource;

export interface EnterpriseApplicationOptions {
	databaseUrl: string;
	host?: string;
	port?: number;
	secureCookies?: boolean;
	runtimeFactory?: EnterpriseRuntimeFactory;
	staticRoot?: string;
}

export interface EnterpriseApplication {
	pool: Pool;
	server: Server;
	identityRepository: PostgresIdentityRepository;
	businessRepository: PostgresEnterpriseBusinessRepository;
	auth: EnterpriseAuthService;
	supportService: EnterpriseSupportService;
	demo: PortfolioEnterpriseDemoData;
	start(): Promise<void>;
	close(): Promise<void>;
}

export function enterpriseApplicationConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EnterpriseApplicationConfig {
	const databaseUrl = env.DATABASE_URL?.trim();
	if (!databaseUrl) throw new Error("DATABASE_URL is required to start the Enterprise application.");
	const configuredPort = env.PORT ?? "3000";
	const port = Number(configuredPort);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a valid TCP port.");
	return { databaseUrl, host: env.HOST?.trim() || "127.0.0.1", port };
}

export function enterpriseRuntimeModeFromEnv(env: NodeJS.ProcessEnv = process.env): EnterpriseRuntimeModeConfig {
	const mode = env.ENTERPRISE_RUNTIME_MODE?.trim() || "deterministic";
	if (mode === "deterministic") return { mode };
	if (mode !== "pi-real") {
		throw new Error("ENTERPRISE_RUNTIME_MODE must be deterministic or pi-real.");
	}
	const providerId = env.PI_PROVIDER?.trim();
	const modelId = env.PI_MODEL?.trim();
	if (!providerId || !modelId) {
		throw new Error("PI_PROVIDER and PI_MODEL are required for pi-real runtime mode.");
	}
	return { mode, providerId, modelId };
}

export type EnterprisePiRuntimeFactoryBootstrap = (
	providerId: string,
	modelId: string,
) => Promise<EnterpriseRuntimeFactory>;

export async function enterpriseRuntimeFactoryFromEnv(
	env: NodeJS.ProcessEnv = process.env,
	bootstrapPiRuntime: EnterprisePiRuntimeFactoryBootstrap = bootstrapPiEnterpriseRuntimeFactory,
): Promise<EnterpriseRuntimeFactory | undefined> {
	const runtimeMode = enterpriseRuntimeModeFromEnv(env);
	if (runtimeMode.mode === "deterministic") return undefined;
	return bootstrapPiRuntime(runtimeMode.providerId!, runtimeMode.modelId!);
}

export async function createEnterpriseApplication(
	options: EnterpriseApplicationOptions,
): Promise<EnterpriseApplication> {
	const databaseUrl = requiredDatabaseUrl(options.databaseUrl);
	const pool = new Pool({ connectionString: databaseUrl });
	let runtimeResource: EnterpriseRuntimeResource | undefined;
	let closed = false;
	try {
		await pool.query("SELECT 1");
		await applyEnterpriseBusinessMigrations(pool);
		const identityRepository = new PostgresIdentityRepository(pool);
		const businessRepository = new PostgresEnterpriseBusinessRepository(pool);
		const demo = await seedPortfolioEnterpriseDemoData(identityRepository);
		runtimeResource = (options.runtimeFactory ?? createDeterministicEnterpriseRuntime)(businessRepository);
		const auth = new EnterpriseAuthService(identityRepository);
		const supportService = new EnterpriseSupportService({
			repository: businessRepository,
			runtime: runtimeResource.runtime,
		});
		const server = createEnterpriseHttpServer({
			auth,
			runtime: runtimeResource.runtime,
			supportService,
			secureCookies: options.secureCookies,
			staticRoot: options.staticRoot ?? enterpriseStaticRoot(),
		});
		return {
			pool,
			server,
			identityRepository,
			businessRepository,
			auth,
			supportService,
			demo,
			async start() {
				if (server.listening) return;
				server.listen(options.port ?? 3000, options.host ?? "127.0.0.1");
				await once(server, "listening");
			},
			async close() {
				if (closed) return;
				closed = true;
				try {
					if (server.listening) await closeServer(server);
				} finally {
					try {
						await runtimeResource?.close?.();
					} finally {
						await pool.end();
					}
				}
			},
		};
	} catch (error) {
		await runtimeResource?.close?.();
		await pool.end();
		throw error;
	}
}

function enterpriseStaticRoot(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
}

export async function startEnterpriseApplication(
	config: EnterpriseApplicationConfig = enterpriseApplicationConfigFromEnv(),
): Promise<EnterpriseApplication> {
	const application = await createEnterpriseApplication(config);
	await application.start();
	return application;
}

export async function startEnterpriseApplicationFromEnv(
	env: NodeJS.ProcessEnv = process.env,
): Promise<EnterpriseApplication> {
	const config = enterpriseApplicationConfigFromEnv(env);
	const runtimeFactory = await enterpriseRuntimeFactoryFromEnv(env);
	const application = await createEnterpriseApplication({ ...config, runtimeFactory });
	await application.start();
	return application;
}

export function createDeterministicEnterpriseRuntime(businessStore: SupportBusinessStore): EnterpriseRuntimeResource {
	const faux = registerFauxProvider();
	const runtime = new SupportAgentRuntime({
		model: faux.getModel(),
		streamFn: streamSimple,
		retrieval: new GovernedKnowledgeRetrievalService(portfolioDemoKnowledge, {
			allowSyntheticTestFixtures: true,
		}),
		store: new InMemorySupportStore(),
		businessStore,
		faq: portfolioDemoFaq,
		allowSyntheticTestKnowledge: true,
	});
	const serializedRuntime = new SerializedEnterpriseDemoRuntime(runtime, faux);
	return {
		runtime: serializedRuntime,
		close: () => serializedRuntime.close(),
	};
}

class SerializedEnterpriseDemoRuntime implements SupportRuntimePort {
	private tail: Promise<void> = Promise.resolve();

	constructor(
		private readonly runtime: SupportAgentRuntime,
		private readonly faux: ReturnType<typeof registerFauxProvider>,
	) {}

	run(request: SupportRequest): Promise<SupportResult> {
		const result = this.tail.then(async () => {
			configureEnterpriseDemoResponses(this.faux, request);
			return this.runtime.run(request);
		});
		this.tail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	async close(): Promise<void> {
		await this.tail;
		this.faux.unregister();
	}
}

function configureEnterpriseDemoResponses(
	faux: ReturnType<typeof registerFauxProvider>,
	request: SupportRequest,
): void {
	if (request.text.includes("请问门店营业时间？")) {
		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: `faq-${request.conversationId}`,
						name: "search_faq",
						arguments: { query: "营业时间" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("Deterministic Enterprise FAQ completion."),
		]);
		return;
	}
	if (request.text.includes("这个退款到底应该按哪个规则处理？")) {
		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: `ambiguous-${request.conversationId}`,
						name: "search_knowledge",
						arguments: { query: "退款按哪个规则" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("Deterministic Enterprise ambiguity completion."),
		]);
		return;
	}
	if (request.text.includes("帮我记录一个退款售后工单")) {
		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: `ticket-${request.conversationId}`,
						name: "create_ticket",
						arguments: {
							summary: "Demo refund after-sales request",
							idempotencyKey: `enterprise-ticket-${request.conversationId}`,
						},
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("已为您记录售后工单。"),
		]);
		return;
	}
	if (request.text.includes("这个投诉我需要转人工处理")) {
		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: `handoff-${request.conversationId}`,
						name: "handoff_to_human",
						arguments: { reason: "Demo complaint requires human handling" },
					},
				],
				{ stopReason: "toolUse" },
			),
		]);
		return;
	}
	faux.setResponses([fauxAssistantMessage("当前演示环境仅提供已验证信息；如需继续，请联系人工客服。")]);
}

function requiredDatabaseUrl(value: string): string {
	const databaseUrl = value.trim();
	if (!databaseUrl) throw new Error("DATABASE_URL is required to start the Enterprise application.");
	return databaseUrl;
}

async function closeServer(server: Server): Promise<void> {
	await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function main(): Promise<void> {
	const application = await startEnterpriseApplicationFromEnv();
	const shutdown = async () => {
		await application.close();
	};
	process.once("SIGINT", () => void shutdown());
	process.once("SIGTERM", () => void shutdown());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	void main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
