/**
 * In-flight guards mirroring the existing support/business lifecycle helpers.
 * Section 7 requires duplicate submission to be disabled while a request is in flight and stale
 * responses after an identity/scope generation change to be discarded rather than repainted.
 */

/** Single-outcome submit guard: begin() refuses a second concurrent submission. */
export class StoreOpsSubmitLifecycle {
	private activeRequest: number | undefined;
	private nextRequest = 0;

	begin(): number | undefined {
		if (this.activeRequest !== undefined) return undefined;
		const request = ++this.nextRequest;
		this.activeRequest = request;
		return request;
	}

	complete(request: number): boolean {
		if (this.activeRequest !== request) return false;
		this.activeRequest = undefined;
		return true;
	}

	invalidate(): void {
		this.nextRequest += 1;
		this.activeRequest = undefined;
	}

	get busy(): boolean {
		return this.activeRequest !== undefined;
	}
}

/** Monotonic read guard: only the latest read may commit, so a late response cannot repaint. */
export class StoreOpsReadLifecycle {
	private active = 0;

	begin(): number {
		this.active += 1;
		return this.active;
	}

	complete(request: number): boolean {
		return this.active === request;
	}

	invalidate(): void {
		this.active += 1;
	}
}
