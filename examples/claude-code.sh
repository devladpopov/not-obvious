#!/bin/sh
# Add Not Obvious to Claude Code (user scope). One key is enough; local embeddings need no Gemini key.
claude mcp add not-obvious --scope user \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -- npx -y -p not-obvious-mcp -p @huggingface/transformers not-obvious-mcp

# Then in Claude Code: /mcp to check it is connected, and use the prompt:
#   /not-obvious:not-obvious (MCP prompts show up as slash commands)
