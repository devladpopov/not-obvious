# Providers: who builds the cliché cloud

The cliché cloud is only as wide as the set of models that answer. Every configured model adds its own batch of answers to it, and the first one that works handles generation, judging and labelling. Order: Claude, Gemini, then OpenAI-compatible models in the order you list them.

| Provider | Variables | Notes |
|---|---|---|
| Claude | `ANTHROPIC_API_KEY`, `NOT_OBVIOUS_CLAUDE_FAST`, `NOT_OBVIOUS_CLAUDE_SMART` | Structured outputs. Also enables Claude web search for the web check. |
| Gemini | `GEMINI_API_KEY`, `NOT_OBVIOUS_GEMINI_FAST`, `NOT_OBVIOUS_GEMINI_SMART` | Each tier can list several models, tried in order. Also enables gemini-embedding-001. |
| OpenRouter | `OPENROUTER_API_KEY`, `NOT_OBVIOUS_OPENROUTER_MODELS` | One provider per model in the comma list. Default: `meta-llama/llama-4-maverick,deepseek/deepseek-chat,mistralai/mistral-medium-3`, three families the Claude/Gemini cloud lacks. |
| Any OpenAI-compatible server | `NOT_OBVIOUS_OPENAI_BASE_URL`, `NOT_OBVIOUS_OPENAI_MODELS`, `NOT_OBVIOUS_OPENAI_API_KEY` (optional) | Ollama, LM Studio, vLLM, llama.cpp server, Together, Groq, DeepInfra and others. One provider per model. |

## How the OpenAI-compatible provider talks to models

- `POST {base}/chat/completions` with a system and a user message.
- Replies with a fixed shape are requested as `response_format: {type: "json_schema", strict: true}`, the same JSON schema Claude and Gemini get. If the server answers 400 (no json_schema support), the provider remembers that and switches to `json_object` plus a "reply with JSON only" instruction; replies are parsed leniently either way.
- `<think>...</think>` blocks that some reasoning models leak into `content` are stripped.
- 408, 429 and 5xx are retried with backoff (Retry-After honoured), like the Gemini provider.
- Each model is labelled with its own id in the cloud, so `map` and the leaderboard can tell who said what.

## Fully local, no keys at all

```bash
ollama pull llama3.3 && ollama pull qwen3
```

```json
{
  "mcpServers": {
    "not-obvious": {
      "command": "npx",
      "args": ["-y", "-p", "not-obvious-mcp", "-p", "@huggingface/transformers", "not-obvious-mcp"],
      "env": {
        "NOT_OBVIOUS_OPENAI_BASE_URL": "http://localhost:11434/v1",
        "NOT_OBVIOUS_OPENAI_MODELS": "llama3.3,qwen3",
        "NOT_OBVIOUS_WEB": "off"
      }
    }
  }
}
```

Models answer locally, embeddings run locally (multilingual-e5-small), the web check is off. Nothing leaves the machine. Two or three different model families give a more honest cloud than one.

## A wider cloud with OpenRouter

```json
"env": {
  "ANTHROPIC_API_KEY": "...",
  "OPENROUTER_API_KEY": "...",
  "NOT_OBVIOUS_OPENROUTER_MODELS": "meta-llama/llama-4-maverick,deepseek/deepseek-chat,qwen/qwen3-235b-a22b"
}
```

Claude handles generation and judging, the OpenRouter models add their answers to the cloud. Check model ids on openrouter.ai/models: ids change, and a model that no longer exists only drops its batch from the cloud (baseline keeps going with the rest).

## A note on themes from mixed providers

`map` clusters answers by meaning, but embeddings also notice form. When one model writes "Name: one-line pitch" and another writes bare names, a theme can end up holding one model's answers only. Asking every model for the same short form (baseline already asks for at most 25 words) keeps this small. If a map looks split by model, look at the `models` field of each theme before reading `consensus` as disagreement.
