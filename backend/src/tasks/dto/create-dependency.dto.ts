import { IsInt, IsString, IsIn } from 'class-validator';

export class CreateDependencyDto {
  @IsInt()
  dependsOnTaskId: number;

  @IsString()
  @IsIn(['blocks', 'relates_to'])
  dependencyType: 'blocks' | 'relates_to';
}
