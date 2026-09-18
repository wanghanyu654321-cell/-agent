import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createSupportExecutionContext, type IdentityRepository, type SupportExecutionContext } from "./identity.ts";

const scrypt = promisify(scryptCallback);
const SESSION_TOKEN_BYTES = 32;
const PASSWORD_KEY_BYTES = 64;

export interface EnterpriseAuthOptions {
	sessionTtlMs?: number;
	now?: () => Date;
}

export interface AuthenticatedSession {
	token: string;
	expiresAt: Date;
}

export class EnterpriseAuthService {
	readonly repository: IdentityRepository;
	private readonly sessionTtlMs: number;
	private readonly now: () => Date;

	constructor(repository: IdentityRepository, options: EnterpriseAuthOptions = {}) {
		this.repository = repository;
		this.sessionTtlMs = options.sessionTtlMs ?? 8 * 60 * 60 * 1000;
		this.now = options.now ?? (() => new Date());
	}

	async login(email: string, password: string): Promise<AuthenticatedSession | undefined> {
		const user = await this.repository.findUserByEmail(email);
		const valid = user ? await verifyPassword(password, user.passwordHash) : await rejectUnknownPassword(password);
		if (!user || !valid) return undefined;
		const now = this.now();
		const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
		const expiresAt = new Date(now.getTime() + this.sessionTtlMs);
		await this.repository.createAuthSession({
			id: randomUUID(),
			userId: user.id,
			tokenHash: hashSessionToken(token),
			expiresAt,
			createdAt: now,
		});
		return { token, expiresAt };
	}

	async logout(token: string | undefined): Promise<void> {
		if (!token) return;
		await this.repository.deleteAuthSessionByTokenHash(hashSessionToken(token));
	}

	async resolveExecutionContext(
		token: string | undefined,
		requestId: string,
	): Promise<SupportExecutionContext | undefined> {
		if (!token) return undefined;
		const tokenHash = hashSessionToken(token);
		const session = await this.repository.findAuthSessionByTokenHash(tokenHash);
		if (!session) return undefined;
		if (session.expiresAt.getTime() <= this.now().getTime()) {
			await this.repository.deleteAuthSessionByTokenHash(tokenHash);
			return undefined;
		}
		const user = await this.repository.findUserById(session.userId);
		if (!user) return undefined;
		const memberships = await this.repository.listMembershipsForUser(user.id);
		if (memberships.length !== 1) return undefined;
		return createSupportExecutionContext(memberships[0]!, requestId);
	}
}

export async function hashPassword(password: string): Promise<string> {
	if (password.length === 0) throw new Error("Password is required.");
	const salt = randomBytes(16);
	const derived = (await scrypt(password, salt, PASSWORD_KEY_BYTES)) as Buffer;
	return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function hashSessionToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
	const [algorithm, saltEncoded, expectedEncoded] = encoded.split("$");
	if (algorithm !== "scrypt" || !saltEncoded || !expectedEncoded) return false;
	const expected = Buffer.from(expectedEncoded, "base64url");
	const actual = (await scrypt(password, Buffer.from(saltEncoded, "base64url"), expected.length)) as Buffer;
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function rejectUnknownPassword(password: string): Promise<boolean> {
	await scrypt(password, Buffer.alloc(16), PASSWORD_KEY_BYTES);
	return false;
}
