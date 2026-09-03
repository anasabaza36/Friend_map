import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types';
import { UserSummary } from '../common/types/user-summary.type';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { FriendsService } from './friends.service';
import {
  FriendRequestActionResponse,
  FriendRequestResponse,
  FriendsResponse,
  RemoveFriendResponse,
} from './types/friends-response.type';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('requests')
  sendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendFriendRequestDto,
  ): Promise<FriendRequestResponse> {
    return this.friendsService.sendFriendRequest(user.id, dto);
  }

  @Get('requests/incoming')
  getIncomingRequests(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FriendRequestResponse[]> {
    return this.friendsService.getIncomingRequests(user.id);
  }

  @Get()
  listFriends(@CurrentUser() user: AuthenticatedUser): Promise<FriendsResponse> {
    return this.friendsService.getFriendsComposite(user.id);
  }

  @Post('requests/:id/accept')
  acceptRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) requestId: string,
  ): Promise<FriendRequestActionResponse> {
    return this.friendsService.acceptFriendRequest(user.id, requestId);
  }

  @Post('requests/:id/reject')
  rejectRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) requestId: string,
  ): Promise<FriendRequestActionResponse> {
    return this.friendsService.rejectFriendRequest(user.id, requestId);
  }

  @Delete(':userId')
  removeFriend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) friendUserId: string,
  ): Promise<RemoveFriendResponse> {
    return this.friendsService.removeFriend(user.id, friendUserId);
  }
}
