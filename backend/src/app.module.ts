import { Module } from '@nestjs/common';
import { CcpModule } from './ccp/ccp.module';
import { AppController } from './app.controller';

@Module({
  imports: [CcpModule],
  controllers: [AppController],
})
export class AppModule {}
