﻿import { AzureFunction, Context } from "@azure/functions";
import { longRunningUploadStart } from "../book/uploadStart";
import { longRunningUploadFinish } from "../book/uploadFinish";
import { LongRunningAction } from "./utils";

const longRunningActions: AzureFunction = async function (
  context: Context
): Promise<any> {
  const input = context.bindingData.data;
  const action = input.action;
  const params = input.params;

  switch (action) {
    case LongRunningAction.UploadStart:
      return await longRunningUploadStart(params);
    case LongRunningAction.UploadFinish:
      return await longRunningUploadFinish(params);
  }
};

export default longRunningActions;
