import { sanitizeSharedContent } from './shared-content-sanitizer';

describe('sanitizeSharedContent', () => {
  it('removes script content from strings', () => {
    expect(sanitizeSharedContent('<script>alert(1)</script>Safe')).toBe('Safe');
  });

  it('removes event handler attributes while keeping markup text', () => {
    const sanitized = sanitizeSharedContent(
      '<img src=x onerror="alert(1)">Task',
    ) as string;
    expect(sanitized).not.toMatch(/onerror/i);
    expect(sanitized).toContain('Task');
  });

  it('sanitizes nested arrays and objects while preserving structure', () => {
    const sanitized = sanitizeSharedContent({
      nodes: [
        {
          text: '<svg onload="alert(1)">Board</svg>',
          metadata: { label: '<script>x</script>Safe' },
        },
      ],
    }) as { nodes: Array<{ text: string; metadata: { label: string } }> };
    expect(Array.isArray(sanitized.nodes)).toBe(true);
    expect(sanitized.nodes[0].metadata.label).toBe('Safe');
    expect(JSON.stringify(sanitized)).not.toMatch(/onload|<script/i);
  });

  it('drops prototype-polluting keys', () => {
    const sanitized = sanitizeSharedContent(
      JSON.parse('{"__proto__": {"polluted": true}, "safe": "value"}'),
    ) as Record<string, unknown>;
    expect(Object.keys(sanitized)).toEqual(['safe']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('passes through non-string primitives unchanged', () => {
    expect(sanitizeSharedContent(42)).toBe(42);
    expect(sanitizeSharedContent(true)).toBe(true);
    expect(sanitizeSharedContent(null)).toBeNull();
  });
});
