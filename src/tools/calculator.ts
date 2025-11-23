import { type Tool } from 'ai';
import { z } from 'zod';

export const calculatorTool: Tool = {
  description: 'Perform mathematical calculations and evaluate expressions',
  inputSchema: z.object({
    expression: z.string().describe('Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(144)", "5 * 6")')
  }),
  execute: async ({ expression }: { expression: string }) => {
    try {
      // Create a safe math context
      const mathFunctions = {
        sqrt: Math.sqrt,
        pow: Math.pow,
        abs: Math.abs,
        floor: Math.floor,
        ceil: Math.ceil,
        round: Math.round,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        log: Math.log,
        exp: Math.exp,
        PI: Math.PI,
        E: Math.E
      };

      // Create safe evaluation function
      const safeEval = new Function(
        ...Object.keys(mathFunctions),
        `"use strict"; return (${expression});`
      );

      const result = safeEval(...Object.values(mathFunctions));

      return {
        expression,
        result: typeof result === 'number' ? result : String(result),
        success: true
      };
    } catch (error) {
      return {
        expression,
        error: 'Invalid mathematical expression',
        success: false
      };
    }
  }
};
