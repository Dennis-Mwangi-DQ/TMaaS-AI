import fs from 'fs';
import path from 'path';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { getEnv } from '../lib/env';
import { createAgentLlm } from '../lib/llmClient';
import { formatAssessmentResponse } from '../output/formatAssessmentResponse';
import { fetchAssessmentResult } from '../output/assessmentResultStore';
import {
  isAssessmentReadyForCompletion,
  runCompleteAssessment,
} from '../assessment/completeAssessment';
import { appendTurn, getOrCreateSession } from '../memory/sessionManager';
import { AssessmentResultSchema } from '../types';
import { fetchEvidenceContext } from './agent-session';
import { ALL_TOOLS } from './tools';

type AgentRunResult = {
  response: string;
  assessmentComplete?: boolean;
  result?: unknown;
};

type MessageContent = string | Array<string | { text?: unknown } | Record<string, unknown>>;
type LangChainMessage = unknown;
type ToolCallLike = {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
};
type AiMessageLike = {
  content?: MessageContent;
  tool_calls?: ToolCallLike[];
};

type RunnableTool = {
  name: string;
  invoke(input: Record<string, unknown>): Promise<unknown>;
};

const toolByName = new Map<string, RunnableTool>(
  ALL_TOOLS.map((tool) => [tool.name, tool as RunnableTool]),
);

function stringifyContent(content: MessageContent | undefined): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
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
    return stringifyContent((output as { content?: MessageContent }).content);
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
    const parsed = JSON.parse(text) as { status?: string; result?: unknown };
    if (parsed?.status === 'assessment_completed' && parsed.result) {
      return parsed.result;
    }
  } catch {
    // Fall through to regex parsing for embedded JSON fragments.
  }

  try {
    const match = text.match(/\{[\s\S]*"status"\s*:\s*"assessment_completed"[\s\S]*\}/);
    if (!match) {
      return undefined;
    }
    const parsed = JSON.parse(match[0]) as { result?: unknown };
    return parsed.result;
  } catch {
    return undefined;
  }
}

function resolveAssessmentResult(
  response: string,
  toolOutputs: string[],
): ReturnType<typeof AssessmentResultSchema.parse> | undefined {
  const candidates = [
    parseAssessmentResult(response),
    ...toolOutputs.map(parseAssessmentResult),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const validated = AssessmentResultSchema.safeParse(candidate);
    if (validated.success) {
      return validated.data;
    }
  }

  return undefined;
}

async function executeToolCall(
  toolCall: ToolCallLike,
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
    } as any);
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
    } as any);
  } catch (error) {
    return new ToolMessage({
      content: error instanceof Error ? error.message : String(error),
      name: toolCall.name,
      status: 'error',
      tool_call_id: toolCallId,
    } as any);
  }
}

export async function runAgent(
  message: string,
  sessionId?: string,
): Promise<AgentRunResult> {
  const session = await getOrCreateSession(sessionId);
  const resolvedSessionId = session.sessionId;
  const evidence = await fetchEvidenceContext(resolvedSessionId);

  const history = session.conversationHistory.map<LangChainMessage>((turn) =>
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

  const messages: LangChainMessage[] = [
    new SystemMessage(
      renderSystemPrompt({
        sessionId: resolvedSessionId,
        topicsCovered,
        evidence: evidenceStr,
      }),
    ),
    ...history,
    new HumanMessage(message),
  ];

  const baseLlm = createAgentLlm({ temperature: 0.1 });
  if (!baseLlm.bindTools) {
    throw new Error('Configured LLM does not support tool calling.');
  }
  const llm = baseLlm.bindTools(ALL_TOOLS);
  const toolOutputs: string[] = [];
  let response = '';

  for (let step = 0; step < getEnv().AGENT_MAX_TOOL_ITERATIONS; step += 1) {
    const aiMessage = (await llm.invoke(messages)) as AiMessageLike;
    messages.push(aiMessage);

    const toolCalls = aiMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      response = stringifyContent(aiMessage.content);
      break;
    }

    for (const toolCall of toolCalls) {
      const toolMessage = await executeToolCall(toolCall, resolvedSessionId);
      toolOutputs.push(stringifyContent((toolMessage as { content?: MessageContent }).content));
      messages.push(toolMessage);
    }
  }

  if (!response) {
    const lastMessage = messages.at(-1);
    response = stringifyContent((lastMessage as AiMessageLike | undefined)?.content);
    if (!response) {
      response = 'I need one more response to complete the assessment step.';
    }
  }

  let parsedResult = resolveAssessmentResult(response, toolOutputs);
  let completedSession = await getOrCreateSession(resolvedSessionId);

  if (!parsedResult) {
    parsedResult = await fetchAssessmentResult(resolvedSessionId);
  }

  const wantsReport = /\b(download|pdf|full report|advisory report|report panel|right panel)\b/i.test(message);
  const agentClaimsReportReady = /\b(report has been generated|available in the panel|right side of your screen|download it as a pdf)\b/i.test(response);

  if (
    !parsedResult &&
    isAssessmentReadyForCompletion(completedSession) &&
    (wantsReport || agentClaimsReportReady || completedSession.status === 'completed')
  ) {
    try {
      parsedResult = await runCompleteAssessment(resolvedSessionId);
      completedSession = await getOrCreateSession(resolvedSessionId);
      if (!response.includes('assessment_completed')) {
        response = 'I have generated your full advisory report. It is now available in the panel on the right, and you can download the PDF using the button there.';
      }
    } catch (error) {
      console.error('Auto-complete assessment failed:', error);
    }
  }

  if (!parsedResult && completedSession.status === 'completed') {
    parsedResult = await fetchAssessmentResult(resolvedSessionId);
  }

  if (parsedResult && completedSession.dimensionScores) {
    response = formatAssessmentResponse(
      parsedResult,
      completedSession.dimensionScores,
      evidence,
    );
  }

  await appendTurn(resolvedSessionId, {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  });
  await appendTurn(resolvedSessionId, {
    role: 'agent',
    content: response,
    timestamp: new Date().toISOString(),
  });

  const assessmentComplete =
    Boolean(parsedResult) ||
    response.includes('assessment_completed') ||
    toolOutputs.some((output) => output.includes('assessment_completed')) ||
    completedSession.status === 'completed';

  return {
    response,
    assessmentComplete,
    result: parsedResult,
  };
}
