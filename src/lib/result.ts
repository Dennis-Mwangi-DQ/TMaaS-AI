import type { ToolResult } from '../types';

export function ok<T>(data: T): ToolResult<T> {
  return { success: true, data };
}

export function fail<T = never>(error: string): ToolResult<T> {
  return { success: false, error };
}
