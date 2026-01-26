/**
 * TipTap extension for callout boxes in emails
 */
import { Node, mergeAttributes } from '@tiptap/core';

export interface CalloutOptions {
    HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        callout: {
            setCallout: (attrs?: { variant?: string }) => ReturnType;
            toggleCallout: (attrs?: { variant?: string }) => ReturnType;
            unsetCallout: () => ReturnType;
        };
    }
}

export const Callout = Node.create<CalloutOptions>({
    name: 'callout',
    group: 'block',
    content: 'block+',
    defining: true,

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            variant: {
                default: 'info',
                parseHTML: (element) => element.getAttribute('data-variant'),
                renderHTML: (attributes) => {
                    return { 'data-variant': attributes.variant };
                },
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'div[data-type="callout"]' },
            { tag: 'div.callout-info', attrs: { variant: 'info' } },
            { tag: 'div.callout-warning', attrs: { variant: 'warning' } },
            { tag: 'div.callout-success', attrs: { variant: 'success' } },
            { tag: 'div.callout-slate', attrs: { variant: 'slate' } },
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        const variant = node.attrs.variant || 'info';
        const className = `callout-${variant}`;
        return [
            'div',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                'data-type': 'callout',
                'data-variant': variant,
                class: className,
            }),
            0,
        ];
    },

    addCommands() {
        return {
            setCallout:
                (attrs) =>
                ({ commands }) => {
                    return commands.wrapIn(this.name, attrs);
                },
            toggleCallout:
                (attrs) =>
                ({ commands }) => {
                    return commands.toggleWrap(this.name, attrs);
                },
            unsetCallout:
                () =>
                ({ commands }) => {
                    return commands.lift(this.name);
                },
        };
    },
});
