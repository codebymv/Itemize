const capitalize = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

export const toastMessages = {
  failedToLoad: (entity: string) => `Failed to load ${entity}`,
  failedToCreate: (entity: string) => `Failed to create ${entity}`,
  failedToUpdate: (entity: string) => `Failed to update ${entity}`,
  failedToDelete: (entity: string) => `Failed to delete ${entity}`,
  failedToSave: (entity: string) => `Failed to save ${entity}`,
  failedToSend: (entity: string) => `Failed to send ${entity}`,
  failedToCancel: (entity: string) => `Failed to cancel ${entity}`,
  failedToDuplicate: (entity: string) => `Failed to duplicate ${entity}`,
  failedToAdd: (entity: string) => `Failed to add ${entity}`,
  failedToConvert: (entity: string) => `Failed to convert ${entity}`,
  created: (entity: string) => `${capitalize(entity)} created successfully`,
  added: (entity: string) => `${capitalize(entity)} added successfully`,
  saved: (entity: string) => `${capitalize(entity)} saved successfully`,
  updated: (entity: string) => `${capitalize(entity)} updated successfully`,
  deleted: (entity: string) => `${capitalize(entity)} deleted successfully`,
  duplicated: (entity: string) => `${capitalize(entity)} duplicated successfully`,
  cancelled: (entity: string) => `${capitalize(entity)} cancelled successfully`,
  copiedToClipboard: (label: string) => `${capitalize(label)} copied to clipboard`,
};
