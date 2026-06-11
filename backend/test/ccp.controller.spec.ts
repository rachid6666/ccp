import { BadRequestException } from '@nestjs/common';
import { CcpController } from '../src/ccp/ccp.controller';

describe('CcpController', () => {
  it('should require token for result access', async () => {
    const controller = new CcpController({} as any);

    await expect(controller.getResult('')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
