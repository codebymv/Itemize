import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

export type GetStartedStep = {
  id: string;
  completed: boolean;
  completedAt: string | null;
  href: string;
};

export type GetStartedProgress = {
  dismissed: boolean;
  completedCount: number;
  totalCount: number;
  steps: GetStartedStep[];
};

const progressFields = `
  dismissed
  completedCount
  totalCount
  steps { id completed completedAt href }
`;

const progressQuery = `
  query GetStartedProgress {
    getStartedProgress { ${progressFields} }
  }
`;

const dismissMutation = `
  mutation DismissGetStarted {
    dismissGetStarted { ${progressFields} }
  }
`;

export const getStartedProgressViaGraphql = async (): Promise<GetStartedProgress> => {
  const data = await graphqlRequest<
    { getStartedProgress: GetStartedProgress },
    Record<string, never>
  >(progressQuery, {});
  return data.getStartedProgress;
};

export const dismissGetStartedViaGraphql = async (): Promise<GetStartedProgress> => {
  const data = await graphqlMutationRequest<
    { dismissGetStarted: GetStartedProgress },
    Record<string, never>
  >(dismissMutation, {});
  return data.dismissGetStarted;
};
