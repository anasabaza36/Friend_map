import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types';
import { UsersService } from './users.service';
import { SafeUser } from '../common/types';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get('search')
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q: string,
  ): Promise<SafeUser[]> {
    return this.usersService.search(q ?? '', user.id);
  }
}
