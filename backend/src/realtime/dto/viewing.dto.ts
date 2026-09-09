import { IsNotEmpty, IsString } from 'class-validator';

export class StopViewingDto {
  @IsString()
  @IsNotEmpty()
  ownerId!: string;
}

export class StartViewingDto {
  @IsString()
  @IsNotEmpty()
  ownerId!: string;
}
