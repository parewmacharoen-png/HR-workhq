// ============================================================================
// modules/asset/asset.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { AssetController } from './interface/http/asset.controller';
import { AssetService } from './application/asset.service';
import { ASSET_REPOSITORY } from './domain/repositories/asset.repository';
import { PrismaAssetRepository } from './infrastructure/persistence/asset.prisma.repository';

@Module({
  controllers: [AssetController],
  providers: [
    AssetService,
    { provide: ASSET_REPOSITORY, useClass: PrismaAssetRepository },
  ],
  exports: [AssetService, ASSET_REPOSITORY],
})
export class AssetModule {}
