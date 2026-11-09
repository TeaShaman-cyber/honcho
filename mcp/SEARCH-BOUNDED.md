# Opt-in bounded workspace search (fork extension)

The workspace search tool accepts optional max_result_json_bytes (512 to 65536).
When absent, the original JSON response with messages and conclusions is
unchanged.

When provided, the server emits honcho_search_bounded_v1 JSON in MCP
content[0].text with explicit retrieved, returned and omitted counts
for messages and conclusions. Included conclusions retain source IDs,
source message IDs, observer/observed provenance and times derived.
Unicode-safe truncation records the original character length. Large
message metadata may be omitted, explicitly marked metadata_omitted=true.

The byte budget covers UTF-8 bytes in the JSON text payload, not the
enclosing JSON-RPC transport frame or the client UI. The result explicitly
keeps total_matches=null/UNKNOWN_UPSTREAM because the Honcho search API
returns a bounded result window, not an authoritative match count.

This is an opt-in format experiment; no live Hermes or Honcho deployment
or existing plugin writing behavior is changed by these source updates.
No duplicate structuredContent is added, to avoid inflating responses.
