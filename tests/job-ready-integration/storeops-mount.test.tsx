import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AuthenticatedShell } from "../../web/src/App.tsx";

it("mounts approved StoreOps views with server authority and gates manager-only attention", () => {
	for (const role of ["agent", "supervisor"]) {
		const markup = renderToStaticMarkup(<AuthenticatedShell context={{ actor: { userId: "test-user", role, capabilities: ["storeops:read", "booking-intent:create"] }, scope: { tenantId: "test-tenant", storeId: "test-store" }, request: { requestId: "test" } }} onLogout={() => {}} />);
		expect(markup).toContain("StoreOps");
		expect(markup).toContain("Today Availability");
		expect(markup).toContain("Booking Intents");
		expect(markup).toContain("approved knowledge registry metadata only");
		expect(markup.includes("Needs Attention")).toBe(role === "supervisor");
	}
});
