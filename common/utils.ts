export function isLocalEnvironment(): boolean {
  // This obscure environment variable is set on the cloud instance but (presumably) not on the local machine.
  // While it might not be the most ideal way to check for running locally, it is what the functions library itself uses as of 11/2021:
  // https://github.com/Azure/azure-functions-host/blob/efb55da/src/WebJobs.Script/Config/ScriptSettingsManager.cs#L25
  //  `public virtual bool IsAzureEnvironment => !string.IsNullOrEmpty(GetSetting(EnvironmentSettingNames.AzureWebsiteInstanceId));`
  //    where `EnvironmentSettingNames.AzureWebsiteInstanceId = "WEBSITE_INSTANCE_ID"`
  return !process.env.WEBSITE_INSTANCE_ID;
}
