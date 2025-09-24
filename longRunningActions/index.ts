import { InvocationContext } from "@azure/functions";
import { longRunningUploadStart } from "../books/uploadStart";
import { longRunningUploadFinish } from "../books/uploadFinish";
import { LongRunningAction } from "./utils";

const longRunningActions = async function (
  input: any,
  context: InvocationContext
): Promise<any> {
  const action = input.action;
  const params = input.params;

  switch (action) {
    case LongRunningAction.UploadStart:
      return await longRunningUploadStart(params, context);
    case LongRunningAction.UploadFinish:
      return await longRunningUploadFinish(params, context);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

export default longRunningActions;
