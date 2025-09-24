import { InvocationContext } from "@azure/functions";
import { getSubscriptionInfo, SubscriptionResult } from "./index";

function createMockHttpRequest(params: { code?: string } = {}): any {
  return {
    params,
    query: new URLSearchParams(),
    headers: new Map(),
    method: "GET",
    url: "http://localhost",
    text: () => Promise.resolve(""),
    json: () => Promise.resolve({}),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    formData: () => Promise.resolve(new FormData()),
  };
}

describe("Subscriptions Integration Test", () => {
  let context: InvocationContext;

  beforeEach(() => {
    const loggerFunction = (...args: unknown[]): void => {
      console.log(...args);
    };
    loggerFunction.error = console.error;
    loggerFunction.warn = console.warn;
    loggerFunction.info = console.info;
    loggerFunction.verbose = console.debug;

    context = {
      log: loggerFunction,
    } as unknown as InvocationContext;
  });

  it("should provide the fields that go with 'Test-Expired-Code'", async () => {
    const request = createMockHttpRequest({ code: "Test-361769-1088" });
    const response = await getSubscriptionInfo(request, context);

    expect(response.status).toBe(200);
    // TODO will this be a problem?
    const result = JSON.parse(
      (response as any).body as string
    ) as SubscriptionResult;
    expect(result.code).toBe("Test-361769-1088");
    expect(result.replacementCode).toBe("Test-727011-1339");
    expect(result.showMessage).toBe("Happy Testing");
  });

  it("should provide the fields that go with 'Legacy-Community'", async () => {
    const request = createMockHttpRequest({ code: "Legacy-Community" });
    const response = await getSubscriptionInfo(request, context);

    expect(response.status).toBe(200);
    const result = JSON.parse(
      (response as any).body as string
    ) as SubscriptionResult;
    expect(result.code).toBe("Legacy-Community");
    expect(result.replacementCode).toBe("Legacy-Community-005962-9361");
    expect(result.tier).toBe("Community");
    expect(result.brandingLabel).toBe("Legacy Community");
    expect(result.showMessage).toBeTruthy();
  });

  it("should return 400 if code is missing", async () => {
    const request = createMockHttpRequest({});
    const response = await getSubscriptionInfo(request, context);

    expect(response.status).toBe(400);
    expect(response.body).toBe("Missing required parameter: code");
  });
});
