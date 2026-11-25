export interface BankOption { id: string; name: string; shortName: string; swiftCode: string; branch: string }
export const MALAWI_BANKS: BankOption[] = [
  { id: 'nbm', name: 'National Bank of Malawi PLC', shortName: 'NBM', swiftCode: 'NBMAMWMW', branch: 'Capital City Branch, Lilongwe' },
  { id: 'stb', name: 'Standard Bank Malawi PLC', shortName: 'Standard Bank', swiftCode: 'SBICMWMW', branch: 'City Centre, Lilongwe' },
  { id: 'fdh', name: 'FDH Bank PLC', shortName: 'FDH Bank', swiftCode: 'FDHBMWMW', branch: 'Victoria Avenue, Blantyre' },
  { id: 'nbs', name: 'NBS Bank PLC', shortName: 'NBS Bank', swiftCode: 'NBSBMWMW', branch: 'Old Town, Lilongwe' },
  { id: 'cnt', name: 'Centenary Bank Malawi', shortName: 'Centenary Bank', swiftCode: 'MYBKMWMW', branch: 'Chichiri, Blantyre' },
];
