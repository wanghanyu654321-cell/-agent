import { once } from "node:events";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { Pool } from "pg";
import type { SupportRuntimePort } from "../http-api.ts";
import {
	InMemoryRetrievalService,
	InMemorySupportStore,
	SupportAgentRuntime,
	type SupportBusinessStore,
} from "../index.ts";
import { EnterpriseAuthService } from "./auth.ts";
import { type EnterpriseBusinessRepository, EnterpriseSupportService } from "./business.ts";
import { type PortfolioEnterpriseDemoData, seedPortfolioEnterpriseDemoData } from "./demo-data.ts";
import { createEnterpriseHttpServer } from "./http-api.ts";
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

export async function startEnterpriseApplication(
	config: EnterpriseApplicationConfig = enterpriseApplicationConfigFromEnv(),
): Promise<EnterpriseApplication> {
	const application = await createEnterpriseApplication(config);
	await application.start();
	return application;
}

export function createDeterministicEnterpriseRuntime(businessStore: SupportBusinessStore): EnterpriseRuntimeResource {
	const faux = registerFauxProvider();
	faux.setResponses([fauxAssistantMessage("当前演示环境仅提供已验证信息；如需继续，请联系人工客服。")]);
	return {
		runtime: new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			businessStore,
			faq: [],
		}),
		close: () => faux.unregister(),
	};
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
	const application = await startEnterpriseApplication();
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
