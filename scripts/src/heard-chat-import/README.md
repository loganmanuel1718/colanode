# Heard Group Chat history plan

This is an **offline mapping tool**, not an importer. It reads a local JSON file and writes a deterministic plan to a new file. It has no database, network, or upload code. Do not feed it production exports until a controlled migration and data handling process is approved. The included tests use invented rows only.

The input is a flat snapshot of Heard's `group_chat_messages` and `group_chat_reactions` tables for **one organization**. Supply explicit Colanode workspace and channel IDs, user mappings, and service actor IDs for system and Roux messages. A user mapping can include `mentionToken`, the exact word following `@` in the saved message text. `records` maps keys such as `menu_item:<Heard UUID>` to a Colanode record node ID. `emojis` maps Unicode reactions to Colanode emoji skin asset IDs. No ID mapping is guessed from names.

```json
{
  "sourceOrganizationId": "11111111-1111-4111-8111-111111111111",
  "targetWorkspaceId": "<Colanode workspace ID>",
  "targetConversationId": "<Colanode channel ID>",
  "users": {
    "22222222-2222-4222-8222-222222222222": {
      "targetUserId": "<Colanode user ID>",
      "mentionToken": "Alex"
    }
  },
  "systemActorId": "<dedicated Colanode user ID>",
  "rouxActorId": "<dedicated Colanode user ID>",
  "records": {},
  "emojis": {},
  "messages": [],
  "reactions": []
}
```

Each message and reaction must include the columns in `plan.ts`; missing or extra columns fail validation. Every row's `organization_id` must match `sourceOrganizationId`. Duplicate message or reaction IDs, cross-organization rows, and orphan reactions fail the whole plan. Missing user mappings omit the affected message or reaction and appear in `issues`.

Run with fixture data:

```sh
npm run plan:heard-chat -w @colanode/scripts -- /path/to/input.json /path/to/new-plan.json
npx tsx --test scripts/src/heard-chat-import/plan.test.ts
```

The output is created with owner-only permissions and will never overwrite an existing file. Repeated runs with the same input and mappings produce identical plans, including deterministic Colanode-shaped message and block IDs. Row order does not matter. The plan keeps the original text, timestamp, author mapping, and source IDs so a later importer can compare them before any write. `contentParity: "deferred"` marks messages that still have a rendering or search parity gate; none of those rows should be replayed as text only.

| Heard field | Plan | Colanode status |
| --- | --- | --- |
| Text | Paragraph block in message attributes | Supported |
| User mention | Mention leaf when source user ID and exact `@token` both map uniquely | Supported, otherwise original text stays and an issue is emitted |
| Emoji reaction | Node reaction intent with mapped author, Unicode-to-skin-ID mapping, and original time | Supported by schema when an emoji mapping exists; historical time needs import path |
| Photo URL | Deferred source reference | Needs authorized asset copy and Colanode file node; no upload here |
| System and Roux posts | Text plus explicit service actor and `kind` provenance | No native kind or styling; no Roux AI behavior |
| Roux citations and safety metadata | Deferred `sources` | No native message field; must be rendered/retained before cutover |
| Menu item and recipe tags | Deferred tag with optional mapped record ID | No native record-tag field or record mention renderer |

**Execution gate:** Colanode's normal `message.create` and `node.reaction.create` mutations assign the current user and time, and message creation assigns a new ID. They cannot replay this plan as history. A separate privileged, idempotent server import path must validate tenant membership, mapped authors and permissions, existing IDs, timestamps, assets, and reaction uniqueness. It must preserve the deferred citation and tag data or add an appropriate schema/rendering path before replacing Heard's chat. No cutover or live import is part of this tool.

Colanode's current text extractor also omits the visible label of a semantic mention from search text. Search parity for `@` mentions needs a separate check before cutover.
