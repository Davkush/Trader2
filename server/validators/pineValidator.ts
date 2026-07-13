import { z } from 'zod';

export function validateConvertedStrategy(code: string): { isValid: boolean; error?: string } {
  if (!code || !code.trim()) {
    return { isValid: false, error: 'Generated code is empty.' };
  }

  // 1. Check for required structure (it should return signals and plots/dashboards, or contain a return statement)
  if (!code.includes('return') && !code.includes('signals')) {
    return { isValid: false, error: 'Code missing required strategy execution or return structure.' };
  }

  // 2. Security Blacklist (Prevent RCE and Data Exfiltration)
  const dangerousPatterns = [
    /\beval\s*\(/, 
    /\bnew\s+Function\b/, 
    /\brequire\s*\(/, 
    /\bimport\b/, 
    /\bfetch\s*\(/, 
    /\bXMLHttpRequest\b/, 
    /\bfs\b/, 
    /\bprocess\.env\b/,
    /\bchild_process\b/, 
    /\bexec\b/, 
    /\bspawn\b/,
    /globalThis/,
    /global\./,
    /window\./,
    /document\./,
    /localStorage/,
    /sessionStorage/,
    /indexedDB/
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return { isValid: false, error: `Security violation: Forbidden keyword or pattern detected in AI output.` };
    }
  }

  return { isValid: true };
}
