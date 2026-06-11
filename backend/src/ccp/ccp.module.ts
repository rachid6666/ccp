import { Module } from '@nestjs/common';
import { CcpController } from './ccp.controller';
import { CcpService } from './ccp.service';
import { CcpParserService } from './ccp-parser.service';
import { RiskScoringService } from './risk-scoring.service';
import { CsvExportService } from './csv-export.service';
import { PrismaService } from '../prisma/prisma.service';
import { UtilsService } from '../common/utils.service';

@Module({
  controllers: [CcpController],
  providers: [
    CcpService,
    CcpParserService,
    RiskScoringService,
    CsvExportService,
    PrismaService,
    UtilsService,
  ],
  exports: [CcpService, PrismaService],
})
export class CcpModule {}
