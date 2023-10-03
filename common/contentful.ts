import { createClient as createContentfulClient } from "contentful";

const contentfulReadOnlyToken = process.env.bloomContentfulReadOnlyToken;

export function validateContentfulEnvironmentVariables(): boolean {
  if (!contentfulReadOnlyToken) {
    console.error("env.bloomContentfulReadOnlyToken is not set");
    return false;
  }
  return true;
}

function getContentfulClient() {
  return createContentfulClient({
    space: "72i7e2mqidxz",
    accessToken: contentfulReadOnlyToken,
  });
}

export async function getContentfulCollectionAndBannerEntries() {
  const client = getContentfulClient();
  const collectionResponse = await client.getEntries({
    content_type: "collection",
    "fields.localization[ne]": "No",
    limit: 1000, // 1000 is the max we are allowed; beyond that, we will have to page.
  });
  //console.log(`got ${collectionResponse.items.length} collection entries`);
  if (collectionResponse.items.length >= 1000)
    throw Error(
      "More than 1000 collection entries; don't update Crowdin until code is enhanced lest we delete strings."
    );
  const bannerResponse = await client.getEntries({
    content_type: "pageBanner",
    "fields.localization[ne]": "No",
    limit: 1000, // 1000 is the max we are allowed; beyond that, we will have to page.
  });
  //console.log(`got ${bannerResponse.items.length} banner entries`);
  if (bannerResponse.items.length >= 1000)
    throw Error(
      "More than 1000 banner entries; don't update Crowdin until code is enhanced lest we delete strings."
    );
  return [...collectionResponse.items, ...bannerResponse.items];
}

interface ICollectionFields {
  urlKey: string;
  useSimpleBookshelfFilter?: boolean;
  filter?: IContentfulCollectionFilter;
  childCollections?: ICollection[];
}
interface ICollection {
  fields?: ICollectionFields;
}
interface IUserFields {
  editorCollections: ICollection[];
}
// One day we may want to expand on this, but for now, it is just any object.
export interface IContentfulCollectionFilter {}

async function getUserEntry(emailAddress: string) {
  const client = getContentfulClient();
  const userResponse = await client.getEntries<IUserFields>({
    content_type: "user",
    "fields.emailAddress": emailAddress,
    select: "fields.editorCollections",
    include: 10, //depth
  });

  return userResponse.items[0];
}

export async function getAllContentfulCollectionFiltersForUser(
  emailAddress: string
) {
  const filters = new Set<IContentfulCollectionFilter>();

  const user = await getUserEntry(emailAddress);
  if (!user) {
    return filters;
  }

  user.fields.editorCollections.forEach((collection) => {
    processCollection(collection, filters);
  });
  return filters;
}

function processCollection(
  collection: ICollection,
  filters: Set<IContentfulCollectionFilter>
) {
  if (!collection.fields) {
    // Apparently, this is what we get if a child collection is a draft.
    return;
  }
  if (collection.fields.childCollections) {
    collection.fields.childCollections.forEach((childCollection) => {
      processCollection(childCollection, filters);
    });
  }

  if (collection.fields.filter) {
    filters.add(collection.fields.filter);
  } else if (collection.fields.useSimpleBookshelfFilter !== false) {
    filters.add({ tag: `bookshelf:${collection.fields.urlKey}` });
  }
}

// Not currently used but useful for debugging and checking what other filters exist in the wild.
function ContentfulCollectionFilterSorter(): (
  a: IContentfulCollectionFilter,
  b: IContentfulCollectionFilter
) => number {
  return (a: { tag?: string }, b: { tag?: string }) => {
    if (a.tag && b.tag) {
      // If both tags exist, compare them
      return a.tag.localeCompare(b.tag);
    } else if (a.tag) {
      // If only a has a tag, a comes first
      return -1;
    } else if (b.tag) {
      // If only b has a tag, b comes first
      return 1;
    } else {
      // If neither has a tag, they're equal
      return 0;
    }
  };
}
