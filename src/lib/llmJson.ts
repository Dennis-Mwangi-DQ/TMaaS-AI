import type { BaseMessage } from "@langchain/core/messages";
import type { z } from "zod";

function messageContentToText(content: BaseMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if ("text" in part && typeof part.text === "string") {
        return part.text;
      }
      return JSON.stringify(part);
    })
    .join("");
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function parseJsonObject(text: string): unknown {
  const unfenced = stripJsonFence(text);

  try {
    return JSON.parse(unfenced);
  } catch {
    // Try to extract either an object {...} or array [...]
    const objStart = unfenced.indexOf("{");
    const objEnd = unfenced.lastIndexOf("}");
    const arrStart = unfenced.indexOf("[");
    const arrEnd = unfenced.lastIndexOf("]");

    const hasObj = objStart !== -1 && objEnd > objStart;
    const hasArr = arrStart !== -1 && arrEnd > arrStart;

    let slice: string | null = null;

    if (hasObj && hasArr) {
      // Pick whichever starts first
      slice =
        objStart < arrStart
          ? unfenced.slice(objStart, objEnd + 1)
          : unfenced.slice(arrStart, arrEnd + 1);
    } else if (hasObj) {
      slice = unfenced.slice(objStart, objEnd + 1);
    } else if (hasArr) {
      slice = unfenced.slice(arrStart, arrEnd + 1);
    }

    if (!slice) {
      throw new Error(
        `Model response did not contain a JSON object or array: ${unfenced}`,
      );
    }

    try {
      return JSON.parse(slice);
    } catch (e) {
      // Re-throw with the raw text for easier debugging
      throw new Error(
        `Failed to parse extracted JSON slice.\nSlice: ${slice}\nOriginal error: ${e}`,
      );
    }
  }
}
export async function invokeJson<T>(
  llm: { invoke(input: string): Promise<BaseMessage> },
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await llm.invoke(prompt);
  return schema.parse(parseJsonObject(messageContentToText(response.content)));
}
