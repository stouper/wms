import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { StoresService } from './stores.service';

@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  list() {
    return this.stores.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.stores.getById(id);
  }

  @Get('by-code/:code')
  getByCode(@Param('code') code: string) {
    return this.stores.getByCode(code);
  }

  @Post()
  create(@Body() dto: { code: string; name?: string; isHq?: boolean }) {
    return this.stores.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { code?: string; name?: string; isHq?: boolean }) {
    return this.stores.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.stores.delete(id);
  }
}
