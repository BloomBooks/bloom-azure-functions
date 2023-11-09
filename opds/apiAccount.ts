import BloomParseServer, { ApiAccount } from "../common/BloomParseServer";
import { Environment } from "../common/utils";

export async function getApiAccount(
  key: string,
  devOrProductionServer?: Environment
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

    /* [JH] I'm backing off this because frankly I'm having trouble finding what is wrong on prod, so
    I want this feedback there.
    // Only on dev, we give more information about what went wrong
    //if (BloomParseServer.DefaultSource == Environment.DEVELOPMENT) {
      */
    if (!account) {
      return {
        resultCode: 403,
        errorMessage: `Did not find apiAccount for '${objectId}'.`,
      };
    }
    // Note: originally I had wanted to use the user's email, but our version of parse server requires
    // masterkey to access that. In practice our user names are the same as emails, for better or for worse.
    // In any case, we're using username now.
    if (account && account.user.username !== keyParts[0]) {
      return {
        resultCode: 403,
        // JH: this just gives away the game (keep it for debugging):   errorMessage: `Found the apiAccount ${account.objectId}, but the userName of the associated user objectId:'${account.user.objectId}, userName:'${account.user.username}', did not match the key username, ${keyParts[0]}.`,

        // This is a good compromise:
        errorMessage: `Found the apiAccount, but the userName of the associated user did not match the key username.`,
      };
    }

    /* [JH] I'm backing off this because frankly I'm having trouble finding what is wrong on prod, so
    I want this feedback there.
    Note, for some (probably unneeded) security, we don't tell the user what we know about what went wrong.
    if (!account || account.user.username !== keyParts[0]) {
      return {
        resultCode: 403,
        errorMessage:
          "We were not able to find a matching api account. Make sure your url has key=<my-bloomlibrary.org-user-account>:<my-api-key>. For example, key=john@example.com:cBGds23pa1",
      };
    }*/

    return { resultCode: 0, account: account };
  } catch (error) {
    return {
      resultCode: 503,
      errorMessage: `Our apologies: we had an internal problem validating your api key. If this problem persists, please write to admin@bloomlibrary.org.
        ${error.message}`,
    };
  }
}
