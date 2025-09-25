import { Context } from "@azure/functions";
import { getSubscriptionInfo, SubscriptionResult } from "./index";

interface TestContext extends Context {
  res: {
    status?: number;
    headers?: { [key: string]: string };
    body?: SubscriptionResult | string;
  };
}

describe("Subscriptions Integration Test", () => {
  let context: TestContext;

  beforeEach(() => {
    const loggerFunction = (...args: any[]): void => {
      console.log(...args);
    };
    loggerFunction.error = console.error;
    loggerFunction.warn = console.warn;
    loggerFunction.info = console.info;
    loggerFunction.verbose = console.debug;

    context = {
      res: {},
    } as unknown as TestContext;
  });

  it("should provide the fields that go with 'Test-Expired-Code'", async () => {
    await getSubscriptionInfo(context, {
      params: { code: "Test-361769-1088" },
    });

    expect(context.res.status).toBe(200);
    expect(context.res.headers?.["Content-Type"]).toBe("application/json");
    const result = context.res.body as SubscriptionResult;
    expect(result.code).toBe("Test-361769-1088");
    expect(result.replacementCode).toBe("Test-727011-1339");
    expect(result.showMessage).toBe("Happy Testing");
  });

  it("should provide the fields that go with 'Legacy-Community'", async () => {
    await getSubscriptionInfo(context, {
      params: { code: "Legacy-Community" },
    });

    expect(context.res.status).toBe(200);
    expect(context.res.headers?.["Content-Type"]).toBe("application/json");
    const result = context.res.body as SubscriptionResult;
    expect(result.code).toBe("Legacy-Community");
    expect(result.replacementCode).toBe("Legacy-Community-005962-9361");
    expect(result.tier).toBe("Community");
    expect(result.brandingLabel).toBe("Legacy Community");
    expect(result.showMessage).toBeTruthy();
  });

  it("should return 400 if code is missing", async () => {
    await getSubscriptionInfo(context, { params: {} });

    expect(context.res.status).toBe(400);
    expect(context.res.body).toBe("Missing required parameter: code");
  });
}); // Remove the special characters test
