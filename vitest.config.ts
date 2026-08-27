import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		env: { PI_OFFLINE: "1" },
	},
});
