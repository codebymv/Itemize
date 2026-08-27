export interface WorkspaceDestination {
  title: string;
  path: string;
}

const desktopDestinations: WorkspaceDestination[] = [
  { title: 'Canvas', path: '/canvas' },
  { title: 'Contents', path: '/contents' },
  { title: 'Shared', path: '/shared-items' },
];

const mobileDestinations: WorkspaceDestination[] = [
  { title: 'Contents', path: '/contents' },
  { title: 'Shared', path: '/shared-items' },
];

export const getWorkspaceDestinations = (isMobile: boolean): WorkspaceDestination[] =>
  isMobile ? mobileDestinations : desktopDestinations;

export const getWorkspaceLanding = (isMobile: boolean): WorkspaceDestination =>
  getWorkspaceDestinations(isMobile)[0];
