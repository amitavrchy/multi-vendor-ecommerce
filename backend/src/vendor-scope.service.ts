import { ForbiddenException, Injectable } from '@nestjs/common';
import { Db } from './db';
import { Principal } from './auth/access';
@Injectable()
export class VendorScope {
  constructor(private db: Db) {}
  async get(user: Principal, ownerOnly = false) {
    const vendor = await this.db.vendor.findFirst({
      where: ownerOnly
        ? { ownerId: user.id }
        : { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
    });
    if (!vendor) throw new ForbiddenException('No store is assigned to this account');
    return vendor;
  }
}
