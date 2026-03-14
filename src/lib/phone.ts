/** Strip a phone number to digits only, normalize to 10-digit US format.
 *  "(555) 123-4567" | "+15551234567" | "5551234567" → "5551234567" */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Strip leading "1" country code if 11 digits
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}
