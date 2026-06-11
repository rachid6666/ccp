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
  async downloadSummary(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadSummaryCsv(token);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      'attachment; filename="resume.csv"',
    );
    res.send(csv);
  }

  @Get('download/failed_clients.csv')
  async downloadFailedClients(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadFailedClientsCsv(token);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      'attachment; filename="clients_echoues.csv"',
    );
    res.send(csv);
  }

  @Get('download/follow_up.csv')
  async downloadFollowUp(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadFollowUpCsv(token);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      'attachment; filename="clients_suivi.csv"',
    );
    res.send(csv);
  }

  @Get('download/risky_clients.csv')
  async downloadRiskyClients(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadRiskyClientsCsv(token);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      'attachment; filename="clients_risque.csv"',
    );
    res.send(csv);
  }

  @Get('download/block_list.csv')
  async downloadBlockList(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadBlockListCsv(token);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      'attachment; filename="liste_blocage.csv"',
    );
    res.send(csv);
  }

  @Get('download/all_clean.csv')
  async downloadAllClean(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const csv = await this.ccpService.downloadAllCleanCsv(token);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      'attachment; filename="toutes_lignes_nettoyees.csv"',
    );
    res.send(csv);
  }
}
