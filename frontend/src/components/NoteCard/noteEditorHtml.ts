export function migrateNoteContentToHtml(content: string): string {
  if (!content) {
    return '';
  }
  if (content !== '<p></p>' && !content.includes('<') && !content.includes('>')) {
    return `<p>${content.replace(/\n/g, '</p><p>')}</p>`;
  }
  return content;
}

export function shouldApplyExternalNoteHtml(options: {
  isFocused: boolean;
  isUpdatingFromProps: boolean;
  currentHtml: string;
  incomingHtml: string;
}): boolean {
  if (options.isFocused || options.isUpdatingFromProps) {
    return false;
  }
  return options.incomingHtml !== options.currentHtml;
}
