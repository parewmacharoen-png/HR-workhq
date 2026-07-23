// ============================================================================
// modules/payroll/domain/services/th-bank-names.ts
// Maps Thai bank codes to display names for transfer sheets.
// ============================================================================

const TH_BANK_NAMES: Record<string, string> = {
  BBL: 'ธนาคารกรุงเทพ',
  KBANK: 'ธนาคารกสิกรไทย',
  KTB: 'ธนาคารกรุงไทย',
  TMB: 'ธนาคารทหารไทยธนชาต',
  TTB: 'ธนาคารทหารไทยธนชาต',
  SCB: 'ธนาคารไทยพาณิชย์',
  CIMB: 'ธนาคารซีไอเอ็มบี ไทย',
  UOB: 'ธนาคารยูโอบี',
  BAY: 'ธนาคารกรุงศรีอยุธยา',
  GSB: 'ธนาคารออมสิน',
  GHB: 'ธนาคารอาคารสงเคราะห์',
  BAAC: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร',
  KKP: 'ธนาคารเกียรตินาคินภัทร',
  TISCO: 'ธนาคารทิสโก้',
  LH: 'ธนาคารแลนด์ แอนด์ เฮ้าส์',
  ICBC: 'ธนาคารไอซีบีซี (ไทย)',
  CITI: 'ธนาคารซิตี้แบงก์',
  HSBC: 'ธนาคารเอชเอสบีซี ประเทศไทย',
};

export function resolveThBankName(bankCode: string | null | undefined): string | null {
  if (!bankCode) return null;
  const normalized = bankCode.trim().toUpperCase();
  return TH_BANK_NAMES[normalized] ?? bankCode;
}
