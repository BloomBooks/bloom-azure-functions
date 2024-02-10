import { getIdAndAction } from "./utils";

describe("books utils", () => {
  it("parseIdAndPossibleAction handles no id or action", () => {
    let result = getIdAndAction("");
    expect(result).toEqual([null, null]);

    result = getIdAndAction(undefined);
    expect(result).toEqual([null, null]);
  });

  it("parseIdAndPossibleAction handles id and no action", () => {
    const result = getIdAndAction("123");
    expect(result).toEqual(["123", null]);
  });

  it("parseIdAndPossibleAction handles id and action", () => {
    const result = getIdAndAction("123:action");
    expect(result).toEqual(["123", "action"]);
  });
});
