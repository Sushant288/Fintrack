// M0: Client-side Validation Helpers
export const isValidEmail = (email: string): boolean => {
  return /^\S+@\S+\.\S+$/.test(email);
};
