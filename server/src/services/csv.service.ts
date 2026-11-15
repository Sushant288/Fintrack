// M7: CSV import/export service
export const importTransactions = async (userId: string, file: any) => {
  return { processed: 0, imported: 0, errors: [] };
};

export const exportTransactions = async (userId: string) => {
  return 'id,date,amount,type,category,notes\n';
};
