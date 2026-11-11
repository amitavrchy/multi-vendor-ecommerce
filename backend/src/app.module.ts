import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { config } from './config';
import { Db } from './db';
import { AccessGuard } from './auth/access';
import { AuthController } from './auth/auth.controller';
import { CatalogController } from './catalog.controller';
import { CartController } from './cart.controller';
import { ProfileController } from './profile.controller';
import { ProviderRegistry } from './modules/payments/registry';
import { WebhookController } from './modules/payments/webhook.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { VendorScope } from './vendor-scope.service';
import { VendorController } from './vendor.controller';
import { VendorCatalogController } from './vendor-catalog.controller';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { RefundsService } from './refunds.service';
import { ReturnsController } from './returns.controller';
import { CancellationController } from './cancellation.controller';
import { ReviewsController } from './reviews.controller';
import { AdminController } from './admin.controller';
import { PayoutsController } from './payouts.controller';
import { JobsService } from './jobs.service';
import { RealtimeGateway } from './realtime.gateway';
@Module({
  imports:[JwtModule.register({global:true,secret:config.JWT_SECRET,signOptions:{expiresIn:'7d'}})],
  controllers:[AuthController,CatalogController,CartController,ProfileController,CheckoutController,WebhookController,VendorController,VendorCatalogController,OrdersController,ReturnsController,CancellationController,ReviewsController,AdminController,PayoutsController],
  providers:[Db,ProviderRegistry,CheckoutService,VendorScope,OrdersService,RefundsService,JobsService,RealtimeGateway,{provide:APP_GUARD,useClass:AccessGuard}],
})
export class AppModule {}
