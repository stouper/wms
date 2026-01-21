import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  // 본사 창고(HQ) Location 목록
  @Get()
  listHq() {
    return this.locations.listHqLocations();
  }

  // 특정 Store의 Location 목록
  @Get('by-store/:storeId')
  listByStore(@Param('storeId') storeId: string) {
    return this.locations.listByStore(storeId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.locations.getById(id);
  }

  @Post()
  create(@Body() dto: { storeId?: string; code: string; name?: string }) {
    return this.locations.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { code?: string; name?: string }) {
    return this.locations.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.locations.delete(id);
  }
}
