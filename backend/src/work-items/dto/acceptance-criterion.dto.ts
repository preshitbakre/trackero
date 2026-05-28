import { IsString, IsOptional, IsBoolean, IsInt, MaxLength, IsArray, ArrayNotEmpty } from 'class-validator';

export class CreateAcceptanceCriterionDto {
  // Required — the Given clause, or the whole statement for a plain criterion.
  @IsString() @MaxLength(2000)
  givenText: string;

  // Omit ⇒ plain criterion. when/then must be supplied together (enforced in service).
  @IsOptional() @IsString() @MaxLength(2000)
  whenText?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  thenText?: string;

  @IsOptional() @IsInt()
  linkedItemId?: number;
}

export class UpdateAcceptanceCriterionDto {
  @IsOptional() @IsString() @MaxLength(2000)
  givenText?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  whenText?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  thenText?: string | null;

  @IsOptional() @IsBoolean()
  isMet?: boolean;

  @IsOptional() @IsInt()
  linkedItemId?: number | null;
}

export class ReorderAcceptanceCriteriaDto {
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true })
  orderedIds: number[];
}
