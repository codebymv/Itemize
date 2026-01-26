/**
 * TipTap extension for badges/labels in emails
 */
import { Mark, mergeAttributes } from '@tiptap/core';

export interface BadgeOptions {
    HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        badge: {
            setBadge: (attrs?: { variant?: string }) => ReturnType;
            toggleBadge: (attrs?: { variant?: string }) => ReturnType;
            unsetBadge: () => ReturnType;
        };
    }
}

export const Badge = Mark.create<BadgeOptions>({
    name: 'badge',

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            variant: {
                default: 'blue',
                parseHTML: (element) => {
                    if (element.classList.contains('badge-blue')) return 'blue';
                    if (element.classList.contains('badge-amber')) return 'amber';
                    if (element.classList.contains('badge-red')) return 'red';
                    if (element.classList.contains('badge-slate')) return 'slate';
                    if (element.classList.contains('badge-green')) return 'green';
                    return 'blue';
                },
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'span.badge-blue', attrs: { variant: 'blue' } },
            { tag: 'span.badge-amber', attrs: { variant: 'amber' } },
            { tag: 'span.badge-red', attrs: { variant: 'red' } },
            { tag: 'span.badge-slate', attrs: { variant: 'slate' } },
            { tag: 'span.badge-green', attrs: { variant: 'green' } },
        ];
    },

    renderHTML({ mark, HTMLAttributes }) {
        const variant = mark.attrs.variant || 'blue';
        const className = `badge-${variant}`;
        return [
            'span',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: className }),
            0,
        ];
    },

    addCommands() {
        return {
            setBadge:
                (attrs) =>
                ({ commands }) => {
                    return commands.setMark(this.name, attrs);
                },
            toggleBadge:
                (attrs) =>
                ({ commands }) => {
                    return commands.toggleMark(this.name, attrs);
                },
            unsetBadge:
                () =>
                ({ commands }) => {
                    return commands.unsetMark(this.name);
                },
        };
    },
});
