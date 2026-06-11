import { Module } from '@nestjs/common';
import { CcpModule } from './ccp/ccp.module';

@Module({
  imports: [CcpModule],
})
export class AppModule {}
