# stats Function

The **stats** function provides statistics about how and how much books are being used.

## URL format

The URL used to access this function always contains `stats` followed by a `category` and a `rowtype`.

`http://api.bloomlibrary.org/v1/stats/{category}/{rowType}`

### category

Currently the only option is `reading`.

### rowType

- **book** - stats about a specific book
- **per-book** - stats about a group of books, one row per book
- **per-day** - stats about a group of books, one row per day
  - the client will often aggregate these by week or month
- **overview** - stats about a group of books, pre-aggregated

## Request payload

A payload is required with a `filter` of type

```
  parseDBQuery?: {
    url: string;
    options: AxiosRequestConfig;
    method: string | undefined;
  };

  bookId?: string;
  bookInstanceId?: string;

  branding?: string;
  country?: string;

  fromDate?: string;
  toDate?: string;
```

One of the following sets will be provided:

1. group of books based on a parse query

   - **parseDBQuery** - A parse query, in the form of an axios request, generated by bloomlibrary.org and passed through directly to us.

2. single book

   - **bookId**
   - **bookInstanceId**

3. group of books based on other parameters
   - [This is basically obsolete. It still works but there are no active collections which use it.]
   - **branding**
   - **country**

Optional. If not provided, will use min/max dates available.

- **fromDate** - A date in format YYYY-MM-DD, used to filter the results to a specific time range.
- **toDate** - A date in format YYYY-MM-DD, used to filter the results to a specific time range.

## Environment Variables

See `../README.md`.