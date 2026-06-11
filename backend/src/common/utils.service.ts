import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class UtilsService {
  hashValue(value: string, salt: string): string {
    return crypto.createHash('sha256').update(value + salt).digest('hex');
  }

  maskCcpAccount(ccpAccount: string): string {
    if (!ccpAccount || ccpAccount.length < 4) {
      return '****';
    }
    const last4 = ccpAccount.slice(-4);
    return `******${last4}`;
  }

  normalizeName(name: string): string {
    if (!name) return '';
    return name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9\s\-]/g, '');
  }

  sanitizeFilename(filename: string): string {
    const sanitized = filename
      .replace(/[^a-z0-9._\- ]/gi, '')
      .trim()
      .slice(0, 255);

    return sanitized || 'result.txt';
  }

  generateAccessToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  parseDate(dateStr: string): Date | null {
    if (!dateStr || !dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      return null;
    }
    const [day, month, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  }

  parseDecimal(value: string): number | null {
    if (!value) return null;
    const parsed = parseFloat(value.replace(',', '.'));
    return isNaN(parsed) ? null : parsed;
  }

  cleanReference(reference: string): string {
    if (!reference) return '';
    return reference
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9\-]/g, '');
  }
}
