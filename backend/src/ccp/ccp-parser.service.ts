import { Injectable } from '@nestjs/common';
import { UtilsService } from '@/common/utils.service';

export interface ParsedCcpLine {
  isValid: boolean;
  errorReason?: string;
  clientAccount: string;
  clientAccountHash: string;
  clientAccountMask: string;
  clientName: string;
  clientNameNorm: string;
  amount: number;
  operationDate: Date;
  ccpAccount: string;
  code: number;
  delayDays: number;
  reference: string;
  cleanReference: string;
  rawLine: string;
}

const RESULT_LINE_REGEX =
  /^(\d{10})\s*([A-ZÀ-ÿ.\-'\s]+?)\s*(\d+\.\d{2})\s*(\d{2}\/\d{2}\/\d{4})\s*(\d{10})\s*([01])\s*(\d{2})\s*(.+)$/i;

@Injectable()
export class CcpParserService {
  constructor(private readonly utils: UtilsService) {}

  parseFile(content: string, salt: string): ParsedCcpLine[] {
    return content
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0)
      .map(line => this.parseLine(line, salt));
  }

  parseLine(rawLine: string, salt: string): ParsedCcpLine {
    const originalLine = rawLine ?? '';
    const line = originalLine.trim();

    if (!line) {
      return this.invalidLine(originalLine, 'Empty line');
    }

    const match = line.match(RESULT_LINE_REGEX);
    if (!match) {
      return this.invalidLine(originalLine, 'Line does not match CCP RESULT format');
    }

    const [
      ,
      clientAccount,
      clientNameRaw,
      amountRaw,
      operationDateRaw,
      ccpAccount,
      codeRaw,
      delayDaysRaw,
      referenceRaw,
    ] = match;

    const amount = this.utils.parseDecimal(amountRaw);
    const operationDate = this.utils.parseDate(operationDateRaw);
    const code = Number(codeRaw);
    const delayDays = Number(delayDaysRaw);

    if (amount === null) {
      return this.invalidLine(originalLine, 'Invalid amount');
    }

    if (!operationDate) {
      return this.invalidLine(originalLine, 'Invalid operation date');
    }

    if (code !== 0 && code !== 1) {
      return this.invalidLine(originalLine, 'Invalid CCP status code');
    }

    if (!Number.isInteger(delayDays)) {
      return this.invalidLine(originalLine, 'Invalid delay days');
    }

    const clientName = clientNameRaw.trim().replace(/\s+/g, ' ');
    const reference = referenceRaw.trim();

    return {
      isValid: true,
      clientAccount,
      clientAccountHash: this.utils.hashValue(clientAccount, salt),
      clientAccountMask: this.utils.maskCcpAccount(clientAccount),
      clientName,
      clientNameNorm: this.utils.normalizeName(clientName),
      amount,
      operationDate,
      ccpAccount,
      code,
      delayDays,
      reference,
      cleanReference: this.utils.cleanReference(reference),
      rawLine: originalLine,
    };
  }

  private invalidLine(rawLine: string, reason: string): ParsedCcpLine {
    return {
      isValid: false,
      errorReason: reason,
      clientAccount: '',
      clientAccountHash: '',
      clientAccountMask: '',
      clientName: '',
      clientNameNorm: '',
      amount: 0,
      operationDate: new Date(0),
      ccpAccount: '',
      code: -1,
      delayDays: 0,
      reference: '',
      cleanReference: '',
      rawLine,
    };
  }
}
