// src/tools.ts
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";
import type { Chat } from "./server";

/**
 * Tools available to the AI. Tools without an `execute` function require
 * human confirmation (they appear as actions the agent can request).
 */

/** Confirmation-required: weather lookup (confirmed by user before running) */
const getWeatherInformation = tool({
  description: "Show the weather in a given city to the user",
  inputSchema: z.object({ city: z.string() })
  // no execute -> requires confirmation; handled in `executions`
});

/** Auto-executing: returns local time for a location */
const getLocalTime = tool({
  description: "Get the local time for a specified location",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    // Replace with real location lookup if desired
    return `Local time for ${location} is ${new Date().toISOString()}`;
  }
});

/** Schedule a task (uses the agent scheduler API) */
const scheduleTask = tool({
  description: "Schedule a task to be executed at a later time",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): never {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }

    const input =
      when.type === "scheduled"
        ? when.date
        : when.type === "delayed"
          ? when.delayInSeconds
          : when.type === "cron"
            ? when.cron
            : throwError("not a valid schedule input");

    try {
      // schedule will use the agent's scheduling API
      agent!.schedule(input as any, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${String(error)}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  }
});

/** List scheduled tasks (auto-exec) */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) return "No scheduled tasks found.";
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${String(error)}`;
    }
  }
});

/** Cancel a scheduled task by taskId */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  inputSchema: z.object({ taskId: z.string().describe("The ID of the task to cancel") }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${String(error)}`;
    }
  }
});

/**
 * Export the tools as a ToolSet for the agents runtime.
 * The `satisfies ToolSet` assertion ensures shape correctness.
 */
export const tools = {
  getWeatherInformation,
  getLocalTime,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask
} satisfies ToolSet;

/**
 * The `executions` object contains the concrete implementations for tools
 * that require human confirmation (tools without `execute` above).
 * Keys must match the tool names.
 */
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Fetching weather for ${city}`);
    // Replace with real API call if desired
    return `The weather in ${city} is sunny (placeholder)`;
  }
};
