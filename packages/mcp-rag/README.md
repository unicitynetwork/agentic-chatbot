# mcp-rag

MCP server providing semantic search over Unicity documentation via ChromaDB.

## Updating the knowledge base

1. Add, edit, or remove `.md` files in the `rag/` directory (project root).
2. Restart the service:
   ```
   docker compose restart mcp-rag
   ```
   The index is rebuilt from scratch on every startup.
