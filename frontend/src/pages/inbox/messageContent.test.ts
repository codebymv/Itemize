import { describe, expect, it } from 'vitest';

import { plainTextToEmailHtml } from './messageContent';

describe('plainTextToEmailHtml', () => {
  it('escapes user-authored markup and preserves line breaks', () => {
    expect(plainTextToEmailHtml(`Hello <Maya> & "Noah"\nIt's ready.`)).toBe(
      'Hello &lt;Maya&gt; &amp; &quot;Noah&quot;<br />It&#039;s ready.',
    );
  });
});
