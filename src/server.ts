// src/server.ts
import { routeAgentRequest, type ExportedHandler } from "agents";
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";

/**
 * Minimal Env typing for Cloudflare worker bindings used here.
 * Add more bindings as your wrangler config provides them (D1, KV, etc.)
 */
export type Env = {
  AI: unknown;
  Chat: DurableObjectNamespace;
  AI_DB?: D1Database;
  SYNC_STORE?: KVNamespace;
  LOCAL_BRIDGE_URL?: string;
  OPENAI_API_KEY?: string;
};

/**
 * The model the agent will use — you can replace this or make it configurable.
 * Note: the @ai-sdk/openai wrapper here expects env configuration in production.
 */
const model = openai("gpt-4o-2024-11-20");

/**
 * Chat agent implementation that handles real-time AI chat interactions
 * The AIChatAgent base provides schedule/ALS/mcp helpers used by the template.
 */
export class Chat extends AIChatAgent<Env> {
  // onChatMessage is invoked by the agents runtime to produce the response stream.
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // Combine local toolset with tools provided by MCP (if any)
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // cleanup and process pending tool-calls
        const cleanedMessages = cleanupMessages(this.messages);

        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a helpful assistant that can do various tasks...
${getSchedulePrompt({ date: new Date() })}
If the user asks to schedule a task, use the schedule tool to schedule the task.`,
          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<typeof allTools>,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  async executeTask(description: string, _task: { type: string; when: unknown }) {
    // Save a message to the agent's message store when scheduled tasks run
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [{ type: "text", text: `Running scheduled task: ${description}` }],
        metadata: { createdAt: new Date() }
      }
    ]);
  }
}

/**
 * Worker entrypoint used by Wrangler.
 *
 * - `fetch` routes API requests into the agents runtime with routeAgentRequest.
 * - `scheduled` implements cron triggers and invokes the agent scheduler if needed.
 */
const handler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Optional health endpoint
    try {
      const url = new URL(request.url);
      if (url.pathname === "/check-open-ai-key") {
        const hasOpenAIKey = !!env.OPENAI_API_KEY || !!process.env.OPENAI_API_KEY;
        return new Response(JSON.stringify({ success: hasOpenAIKey }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    } catch (e) {
      // ignore
    }

    if (!process.env.OPENAI_API_KEY && !env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set in env or process.env — set it locally (.dev.vars) and in Cloudflare secrets"
      );
    }

    // routeAgentRequest delegates to the Agents runtime (AIChatAgent classes etc.)
    const routed = await routeAgentRequest(request, env as any);
    return routed ?? new Response("Not found", { status: 404 });
  },

  // scheduled handler invoked by Wrangler cron triggers (if configured)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log("Scheduled trigger:", new Date().toISOString(), "event:", event.cron);
    // You can trigger agent scheduled work here. Example: create a small request
    // that the agents runtime can handle (or call a DO directly).
    try {
      // Example: ping /internal/schedule to let the Agent pick up scheduled tasks
      const res = await fetch("https://example.invalid/internal/schedule", { method: "POST" })
        .catch(() => null);
      // no-op; real implementation would call your agent endpoint
    } catch (err) {
      console.error("Scheduled handler error:", err);
    }
  }
};

export default handler;
