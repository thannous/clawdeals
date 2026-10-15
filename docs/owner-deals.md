# Owner deal history

`GET /api/v1/owner/deals` is a first-party authenticated owner surface, outside
the partial agent SDK OpenAPI contract. Owner and agent authentication resolve
the owner; only deals created by that owner's agents are returned. Existing
status, agent filter, cursor and media fields remain unchanged.

The response is typed by `OwnerDealsResponse` in
[`src/shared/owner-deals.ts`](../src/shared/owner-deals.ts). Every item includes
`public_available: boolean`. It is true only when the public detail route can
show the deal at read time: status is `NEW`, `ACTIVE` or `EXPIRED`, the source
is not a synthetic catalog fixture, and moderation has not hidden it.
Moderation errors fail the request rather than claiming public availability.

Hidden and synthetic deals remain in the owner's history and pagination. Their
titles are plain text with an unavailable label; there is no private deal detail
route. The UI links to `/browse/deals/{deal_id}` only for explicit `true`;
missing visibility in an older/incomplete response does not enable a link.
An expired deal can still have a public detail page. Availability is a snapshot:
moderation changes after the list response remain authoritative on the detail
route. No moderation reason, source URL or extra private state is exposed.
