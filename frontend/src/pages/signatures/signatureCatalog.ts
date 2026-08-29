import type { SignatureDocument, SignatureTemplate } from '@/services/signaturesApi';

export type DocumentStatusFilter = 'all' | 'active' | 'draft' | 'completed' | 'invalid';
export type TemplateReadinessFilter = 'all' | 'ready' | 'needs_file';

export const getDocumentStats = (documents: SignatureDocument[]) => {
  const draft = documents.filter((document) => document.status === 'draft').length;
  const active = documents.filter((document) =>
    ['sent', 'in_progress'].includes(document.status),
  ).length;
  const completed = documents.filter((document) => document.status === 'completed').length;
  const invalid = documents.filter((document) =>
    ['cancelled', 'expired'].includes(document.status),
  ).length;

  return { invalid, draft, active, completed };
};

export const filterDocuments = (
  documents: SignatureDocument[],
  query: { search: string; status: DocumentStatusFilter },
) => {
  const normalizedSearch = query.search.trim().toLowerCase();

  return documents.filter((document) => {
    const matchesStatus = query.status === 'all'
      || (query.status === 'active' && ['sent', 'in_progress'].includes(document.status))
      || (query.status === 'invalid' && ['cancelled', 'expired'].includes(document.status))
      || document.status === query.status;
    const matchesSearch = normalizedSearch.length === 0
      || [document.title, document.document_number, document.description, document.message]
        .some((value) => value?.toLowerCase().includes(normalizedSearch));

    return matchesStatus && matchesSearch;
  });
};

export const getTemplateStats = (templates: SignatureTemplate[]) => {
  const ready = templates.filter((template) => template.is_ready).length;
  return { total: templates.length, ready, needsFile: templates.length - ready };
};

export const filterTemplates = (
  templates: SignatureTemplate[],
  query: { search: string; readiness: TemplateReadinessFilter },
) => {
  const normalizedSearch = query.search.trim().toLowerCase();

  return templates.filter((template) => {
    const isReady = template.is_ready;
    const matchesReadiness = query.readiness === 'all'
      || (query.readiness === 'ready' && isReady)
      || (query.readiness === 'needs_file' && !isReady);
    const matchesSearch = normalizedSearch.length === 0
      || [template.title, template.description, template.message, template.file_name]
        .some((value) => value?.toLowerCase().includes(normalizedSearch));

    return matchesReadiness && matchesSearch;
  });
};
