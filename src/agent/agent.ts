import fs from 'fs';
import path from 'path';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
  type MessageContent,
  type ToolCall,
} from '@langchain/core/messages';
import { getEnv } from '../lib/env';
import { createAgentLlm } from '../lib/llmClient';
import { appendTurn, getOrCreateSession } from '../memory/sessionManager';
import { fetchEvidenceContext } from './agent-session';
import { ALL_TOOLS } from './tools';

type AgentRunResult = {
  response: string;
  assessmentComplete?: boolean;
  result?: unknown;
};

type RunnableTool = {
  name: string;
  invoke(input: Record<string, unknown>): Promise<unknown>;
};

const toolByName = new Map<string, RunnableTool>(
  ALL_TOOLS.map((tool) => [tool.name, tool as RunnableTool]),
);

function stringifyContent(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if ('text' in part && typeof part.text === 'string') {
        return part.text;
      }
      return JSON.stringify(part);
    })
    .join('');
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }
  if (output instanceof ToolMessage) {
    return stringifyContent(output.content);
  }
  return JSON.stringify(output);
}

function renderSystemPrompt(params: {
  sessionId: string;
  topicsCovered: string;
  evidence: string;
}): string {
  const promptTpl = fs.readFileSync(
    path.join(process.cwd(), 'prompts/system_prompt.md'),
    'utf-8',
  );

  return promptTpl
    .replace('{{TOPICS_COVERED}}', params.topicsCovered)
    .replace('{{EVIDENCE}}', params.evidence)
    .concat(`\n\nCurrent Session ID:\n${params.sessionId}`);
}

function parseAssessmentResult(text: string): unknown | undefined {
  try {
    const match = text.match(/\{"status":"assessment_completed".*\}/);
    if (!match) {
      return undefined;
    }
    const parsed = JSON.parse(match[0]) as { result?: unknown };
    return parsed.result;
  } catch {
    return undefined;
  }
}

async function executeToolCall(
  toolCall: ToolCall,
  sessionId: string,
): Promise<ToolMessage> {
  const tool = toolByName.get(toolCall.name);
  const toolCallId = toolCall.id ?? `${toolCall.name}-${Date.now()}`;

  if (!tool) {
    return new ToolMessage({
      content: `Tool not found: ${toolCall.name}`,
      name: toolCall.name,
      status: 'error',
      tool_call_id: toolCallId,
    });
  }

  try {
    const args = {
      ...(toolCall.args ?? {}),
      sessionId,
    };
    const output = await tool.invoke(args);

    return new ToolMessage({
      content: stringifyToolOutput(output),
      name: toolCall.name,
      status: 'success',
      tool_call_id: toolCallId,
    });
  } catch (error) {
    return new ToolMessage({
      content: error instanceof Error ? error.message : String(error),
      name: toolCall.name,
      status: 'error',
      tool_call_id: toolCallId,
    });
  }
}

export async function runAgent(
  message: string,
  sessionId: string,
): Promise<AgentRunResult> {
  const session = await getOrCreateSession(sessionId);
  const evidence = await fetchEvidenceContext(sessionId);

  const history = session.conversationHistory.map<BaseMessage>((turn) =>
    turn.role === 'user'
      ? new HumanMessage(turn.content)
      : new AIMessage(turn.content),
  );

  const topicsCovered = session.topicsCompleted.join(', ') || 'None';
  const evidenceStr = JSON.stringify(
    evidence.map((record) => ({
      dimension: record.dimension,
      meaning: record.agentInterpretation,
    })),
  );

  const messages: BaseMessage[] = [
    new SystemMessage(
      renderSystemPrompt({
        sessionId,
        topicsCovered,
        evidence: evidenceStr,
      }),
    ),
    ...history,
    new HumanMessage(message),
  ];

  const llm = createAgentLlm({ temperature: 0.1 }).bindTools(ALL_TOOLS);
  const toolOutputs: string[] = [];
  let response = '';

  for (let step = 0; step < getEnv().AGENT_MAX_TOOL_ITERATIONS; step += 1) {
    const aiMessage = (await llm.invoke(messages)) as AIMessage;
    messages.push(aiMessage);

    const toolCalls = aiMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      response = stringifyContent(aiMessage.content);
      break;
    }

    for (const toolCall of toolCalls) {
      const toolMessage = await executeToolCall(toolCall, sessionId);
      toolOutputs.push(stringifyContent(toolMessage.content));
      messages.push(toolMessage);
    }
  }

  if (!response) {
    const lastMessage = messages.at(-1);
    response =
      lastMessage instanceof AIMessage
        ? stringifyContent(lastMessage.content)
        : 'I need one more response to complete the assessment step.';
  }

  await appendTurn(sessionId, {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  });
  await appendTurn(sessionId, {
    role: 'agent',
    content: response,
    timestamp: new Date().toISOString(),
  });

  const result =
    parseAssessmentResult(response) ??
    toolOutputs.map(parseAssessmentResult).find((value) => value !== undefined);
  const assessmentComplete =
    Boolean(result) ||
    response.includes('assessment_completed') ||
    toolOutputs.some((output) => output.includes('assessment_completed')) ||
    session.status === 'completed';

  return {
    response,
    assessmentComplete,
    result,
  };
}
