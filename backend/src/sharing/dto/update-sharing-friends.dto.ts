import { IsArray, IsUUID } from 'class-validator';

export class UpdateSharingFriendsDto {
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each friendId must be a valid UUID' })
  friendIds!: string[];
}
