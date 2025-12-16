import { Injectable } from '@nestjs/common';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class HqInventoryService {
  constructor(private readonly inventory: InventoryService) {}

  async apply(row: {
    sku: string;
    qty: number;
    location?: string;
    makerCode?: string;
    name?: string;
  }) {
    return this.inventory.setQuantity({
      sku: row.sku,
      quantity: row.qty,
      location: row.location,
      makerCode: row.makerCode,
      name: row.name,
    });
  }
}
