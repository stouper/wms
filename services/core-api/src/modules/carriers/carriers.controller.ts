import { Controller, Get, Param } from '@nestjs/common';
import { CarriersService } from './carriers.service';

@Controller('carriers')
export class CarriersController {
  constructor(private readonly carriers: CarriersService) {}

  @Get()
  list() {
    // 서비스 메서드명은 findAll
    return this.carriers.findAll();
  }

  @Get(':code/track/:number')
  track(@Param('code') code: string, @Param('number') number: string) {
    return this.carriers.track(code, number);
  }
}
