import { createClient as createContentfulClient } from "contentful";

export const kAllBooksFilter = "all-books";
const kRootCollectionUrlKey = "root.read";

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

// In Contentful, we have a User type which can be connected to zero or more "Editor Collections"
// over which the user has editor permission. Each Editor Collection will also give editor
// permission to all of its child collections.
// This function returns the filters for all the collections for which the user has editor permission.
export async function getAllContentfulCollectionFiltersForUser(
  emailAddress: string
) {
  const collectionDefiningFilters = new Set<IContentfulCollectionFilter>();

  const user = await getUserEntry(emailAddress);
  if (!user?.fields?.editorCollections?.length) {
    return collectionDefiningFilters;
  }

  // This is going to be common enough (for staff) that it is worth shortcutting.
  // Also, by providing the root collection, we really mean every book.
  // But every book probably isn't actually included in some descendant collection.
  if (
    user.fields.editorCollections.some(
      (ec) => ec.fields?.urlKey === kRootCollectionUrlKey
    )
  ) {
    collectionDefiningFilters.add(kAllBooksFilter);
    return collectionDefiningFilters;
  }

  user.fields.editorCollections.forEach((collection) => {
    collectFilters(collection, collectionDefiningFilters);
  });
  return collectionDefiningFilters;
}

// Collect all the filters for this collection and its children.
function collectFilters(
  collection: ICollection,
  filters: Set<IContentfulCollectionFilter>,
  depth = 0
) {
  if (!collection.fields) {
    // Apparently, this is what we get if a child collection is a draft.
    return;
  }
  if (depth > 20) {
    // Handle pathological case of a cyclic collection hierarchy.
    console.error(
      `collectFilters: depth > 20; probably a cycle in the collection hierarchy`
    );
    return;
  }

  if (collection.fields.childCollections) {
    collection.fields.childCollections.forEach((childCollection) => {
      collectFilters(childCollection, filters);
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
