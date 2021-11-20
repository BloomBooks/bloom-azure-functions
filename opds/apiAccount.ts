import BloomParseServer, {
  BloomParseServerMode,
  ApiAccount,
} from "../common/BloomParseServer";

export async function getApiAccount(
  key: string,
  devOrProductionServer?: BloomParseServerMode
): Promise<{
  account?: ApiAccount;
  resultCode: number;
  errorMessage?: string;
}> {
  if (!key || !key.trim()) {
    return {
      resultCode: 401,
      errorMessage:
        "Please include your API key. Example: https://api.bloomlibrary.org/v1/catalog?key=pat@example.com:1a2b3d4. For key information, please write to admin@bloomlibrary.org",
    };
  }

  BloomParseServer.setServer(
    devOrProductionServer || BloomParseServer.DefaultSource
  );

  const keyParts = key.split(":");
  if (keyParts.length < 1) {
    return {
      resultCode: 403,
      errorMessage: "Keys are of the form pat@example.com:1a2b3d4",
    };
  }
  const objectId = keyParts[keyParts.length - 1]; // last part when split by colons

  try {
    if (key === "pretend-parse-server-down") {
      throw new Error("pretend problem talking to Parse Server");
    }

    const account = await BloomParseServer.getApiAccount(objectId);

    // Only on dev, we give more information about what went wrong
    if (BloomParseServer.DefaultSource == BloomParseServerMode.DEVELOPMENT) {
      if (!account) {
        return {
          resultCode: 403,
          errorMessage: `Did not find account for '${objectId}'.`,
        };
      }
      // Note: originally I had wanted to use the user's email, but our version of parse server requires
      // masterkey to access that. In practice our user names are the same as emails, for better or for worse.
      // In any case, we're using username now.
      if (account && account.user.username !== keyParts[0]) {
        return {
          resultCode: 403,
          errorMessage: `Found the apiAccount ${account.objectId}, but the userName of the associated user objectId:'${account.user.objectId}, userName:'${account.user.username}', did not match the key username, ${keyParts[0]}.`,
        };
      }
    }
    // Note, for some (probably unneeded) security, we don't tell the user what we know about what went wrong.
    if (!account || account.user.username !== keyParts[0]) {
      return {
        resultCode: 403,
        errorMessage:
          "We were not able to find a matching api account. Make sure your url has key=<my-bloomlibrary.org-user-account>:<my-api-key>. For example, key=john@example.com:cBGds23pa1",
      };
    }
    return { resultCode: 0, account: account };
  } catch (error) {
    return {
      resultCode: 503,
      errorMessage:
        "Our apologies: we had an internal problem validating your api key. If this problem persists, please write to admin@bloomlibrary.org",
    };
  }
}
