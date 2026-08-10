/**
 * Structured per-call logging for /mcp — Addendum C.3: "Every MCP call logged: token id, user id,
 * tool name, argument byte size, outcome, duration. Never log the token itself." Matches
 * server.ts's existing convention of one JSON object per console.log line.
 */
export function logMcpToolCall(entry: {
  tokenId: string;
  userId: string;
  tool: string;
  argBytes: number;
  outcome: "ok" | "error";
  durationMs: number;
}): void {
  console.log(JSON.stringify({ event: "mcp_tool_call", ...entry }));
}
