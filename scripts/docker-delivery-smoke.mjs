const phase = process.argv[2];
const baseUrl = process.env.DOCKER_DELIVERY_BASE_URL ?? "http://127.0.0.1:3000";
const ticketConversationId = "docker-persist-ticket";

if (phase !== "write" && phase !== "read-after-recreate") {
  throw new Error("Usage: node scripts/docker-delivery-smoke.mjs <write|read-after-recreate>");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, options = {}) {
  return fetch(new URL(path, baseUrl), options);
}

async function json(response, description) {
  const body = await response.json();
  assert(response.ok, `${description} failed with HTTP ${response.status}`);
  return body;
}

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  let lastError = "health endpoint did not return HTTP 200";

  while (Date.now() < deadline) {
    try {
      const response = await request("/healthz");
      if (response.ok) {
        return;
      }
      lastError = `health endpoint returned HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`application did not become healthy: ${lastError}`);
}

async function login(email, password) {
  const response = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  await json(response, `login for ${email}`);

  const setCookie = response.headers.get("set-cookie");
  assert(setCookie, `login for ${email} did not return a session cookie`);
  return setCookie.split(";", 1)[0];
}

async function authenticatedJson(path, cookie, options, description) {
  const response = await request(path, {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      cookie,
    },
  });
  return json(response, description);
}

function assertActorScope(me, expectedRole, expectedTenantId, expectedStoreId) {
  assert(me?.actor?.role === expectedRole, `expected role ${expectedRole}`);
  assert(me?.scope?.tenantId === expectedTenantId, `expected tenant ${expectedTenantId}`);
  assert(me?.scope?.storeId === expectedStoreId, `expected store ${expectedStoreId}`);
}

function containsConversation(records, conversationId) {
  return Array.isArray(records) && records.some((record) => record.conversationId === conversationId);
}

function assertPublicAuditEvents(events) {
  assert(Array.isArray(events), "audit-events response must be an array");
  for (const event of events) {
    assert(!("payload" in event), "audit event must not expose raw payload");
    assert(!("sessionEvents" in event), "audit event must not expose Pi session events");
    assert(!("provider" in event), "audit event must not expose provider internals");
  }
}

async function runWritePhase() {
  await waitForHealth();

  const aliceCookie = await login("alice.agent@demo.example", "AliceDemo!2026");
  const aliceMe = await authenticatedJson("/api/v1/auth/me", aliceCookie, undefined, "Alice /auth/me");
  assertActorScope(aliceMe, "agent", "demo-tenant-a", "demo-store-a1");

  const faqResult = await authenticatedJson(
    "/api/v1/support/respond",
    aliceCookie,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "docker-governed-faq",
        customerId: "docker-customer-a",
        text: "请问门店营业时间？",
      }),
    },
    "governed FAQ support request",
  );
  assert(faqResult?.type === "answer", "governed FAQ must return an answer");
  assert(Array.isArray(faqResult.evidence) && faqResult.evidence.length === 1, "governed FAQ must return one authorized evidence record");

  const ticketResult = await authenticatedJson(
    "/api/v1/support/respond",
    aliceCookie,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: ticketConversationId,
        customerId: "docker-customer-a",
        text: "帮我记录一个退款售后工单",
      }),
    },
    "ticket support request",
  );
  assert(Array.isArray(ticketResult?.toolsCalled) && ticketResult.toolsCalled.includes("create_ticket"), "ticket request must invoke create_ticket");

  const aliceTickets = await authenticatedJson("/api/v1/tickets", aliceCookie, undefined, "Alice ticket read-back");
  assert(containsConversation(aliceTickets, ticketConversationId), "Alice scoped ticket read-back did not find the persisted ticket");

  const bobCookie = await login("bob.agent@demo.example", "BobDemo!2026");
  const bobTickets = await authenticatedJson("/api/v1/tickets", bobCookie, undefined, "Bob ticket read-back");
  assert(!containsConversation(bobTickets, ticketConversationId), "Bob must not read Tenant A's ticket");
}

async function runReadAfterRecreatePhase() {
  await waitForHealth();

  const aliceCookie = await login("alice.agent@demo.example", "AliceDemo!2026");
  const aliceTickets = await authenticatedJson("/api/v1/tickets", aliceCookie, undefined, "persisted Alice ticket read-back");
  assert(containsConversation(aliceTickets, ticketConversationId), "persisted ticket was not available after compose recreation");

  const avaCookie = await login("ava.admin@demo.example", "AvaDemo!2026");
  const auditEvents = await authenticatedJson("/api/v1/audit-events", avaCookie, undefined, "Ava audit read-back");
  assertPublicAuditEvents(auditEvents);
  assert(containsConversation(auditEvents, ticketConversationId), "Ava audit read-back did not include the persisted ticket conversation");
}

if (phase === "write") {
  await runWritePhase();
} else {
  await runReadAfterRecreatePhase();
}

console.log(`Docker delivery smoke ${phase}: PASS`);
