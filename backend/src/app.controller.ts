import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      status: 'ok',
      app: 'CCP Analyzer DZ API',
    };
  }

  @Get('api/health')
  getHealth() {
    return {
      status: 'ok',
    };
  }
}
