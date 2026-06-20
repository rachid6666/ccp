import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFiles,
  Body,
  Query,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CcpService } from './ccp.service';

const maxUploadFiles = parseInt(process.env.MAX_UPLOAD_FILES || '100');
const maxUploadSizeMb = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '50');
const uploadInterceptorOptions = {
  limits: {
    files: maxUploadFiles,
    fileSize: maxUploadSizeMb * 1024 * 1024,
  },
};

@Controller('api/ccp')
export class CcpController {
  constructor(private ccpService: CcpService) {}

  @Post('preview')
  @UseInterceptors(FilesInterceptor('files', maxUploadFiles, uploadInterceptorOptions))
  async previewFiles(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const formattedFiles = files.map(file => ({
      buffer: file.buffer,
      filename: file.originalname,
    }));

    return this.ccpService.previewFiles(formattedFiles);
  }

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', maxUploadFiles, uploadInterceptorOptions))
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('showroomName') showroomName: string,
    @Body('phone') phone: string | null,
    @Body('wilaya') wilaya: string | null,
    @Body('paymentCycleStartDay') paymentCycleStartDayStr: string | null,
    @Body('consentAccepted') consentAcceptedStr: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const consentAccepted = consentAcceptedStr === 'true';

    const formattedFiles = files.map(file => ({
      buffer: file.buffer,
      filename: file.originalname,
    }));

    const result = await this.ccpService.uploadFiles(
      formattedFiles,
      showroomName,
      phone,
      wilaya,
      paymentCycleStartDayStr ? parseInt(paymentCycleStartDayStr, 10) : 5,
      consentAccepted,
    );

    return result;
  }

  @Get('result')
  async getResult(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    return this.ccpService.getSessionResult(token);
  }

  @Get('download/summary.csv')
  async downloadSummary(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadSummaryCsv(token);
    this.sendCsv(res, csv, 'resume.csv');
  }

  @Get('download/summary.xls')
  async downloadSummaryXls(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const xls = await this.ccpService.downloadSummaryXls(token);
    this.sendXls(res, xls, 'resume.xls');
  }

  @Get('download/failed_clients.csv')
  async downloadFailedClients(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadFailedClientsCsv(token);
    this.sendCsv(res, csv, 'clients_echoues.csv');
  }

  @Get('download/failed_clients.xls')
  async downloadFailedClientsXls(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const xls = await this.ccpService.downloadFailedClientsXls(token);
    this.sendXls(res, xls, 'clients_echoues.xls');
  }

  @Get('download/follow_up.csv')
  async downloadFollowUp(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadFollowUpCsv(token);
    this.sendCsv(res, csv, 'clients_suivi.csv');
  }

  @Get('download/follow_up.xls')
  async downloadFollowUpXls(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const xls = await this.ccpService.downloadFollowUpXls(token);
    this.sendXls(res, xls, 'clients_suivi.xls');
  }

  @Get('download/risky_clients.csv')
  async downloadRiskyClients(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadRiskyClientsCsv(token);
    this.sendCsv(res, csv, 'clients_risque.csv');
  }

  @Get('download/risky_clients.xls')
  async downloadRiskyClientsXls(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const xls = await this.ccpService.downloadRiskyClientsXls(token);
    this.sendXls(res, xls, 'clients_risque.xls');
  }

  @Get('download/block_list.csv')
  async downloadBlockList(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadBlockListCsv(token);
    this.sendCsv(res, csv, 'liste_blocage.csv');
  }

  @Get('download/block_list.xls')
  async downloadBlockListXls(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const xls = await this.ccpService.downloadBlockListXls(token);
    this.sendXls(res, xls, 'liste_blocage.xls');
  }

  @Get('download/all_clean.csv')
  async downloadAllClean(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadAllCleanCsv(token);
    this.sendCsv(res, csv, 'toutes_lignes_nettoyees.csv');
  }

  @Get('download/all_clean.xls')
  async downloadAllCleanXls(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const xls = await this.ccpService.downloadAllCleanXls(token);
    this.sendXls(res, xls, 'toutes_lignes_nettoyees.xls');
  }

  @Get('admin/download/global-risk.xls')
  async downloadGlobalRiskXls(
    @Query('adminToken') adminToken: string,
    @Res() res: Response,
  ) {
    const xls = await this.ccpService.downloadGlobalRiskXls(adminToken);
    this.sendXls(res, xls, 'global_risk_clients.xls');
  }

  @Post('admin/rebuild-global-risk')
  async rebuildGlobalRisk(@Query('adminToken') adminToken: string) {
    return this.ccpService.rebuildGlobalRiskDataset(adminToken);
  }

  private sendCsv(res: Response, csv: string, filename: string): void {
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  private sendXls(res: Response, xls: string, filename: string): void {
    res.header('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xls);
  }
}
