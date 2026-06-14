import { IsString, MaxLength, IsOptional, IsInt, IsIn } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsInt()
  leadId?: number;

  @IsOptional()
  @IsInt()
  defaultAssigneeId?: number;

  @IsOptional()
  @IsInt()
  defaultSprintDuration?: number;

  @IsOptional()
  @IsString()
  @IsIn(['free', 'fibonacci', 'tshirt'])
  estimationScale?: 'free' | 'fibonacci' | 'tshirt';

  // Accepted by the DTO so the ValidationPipe does not reject the request,
  // but intentionally never assigned in update() — methodology is immutable
  // after creation.
  @IsOptional()
  @IsIn(['scrum', 'kanban'])
  methodology?: 'scrum' | 'kanban';
}
