import { z } from 'zod';
import { passwordSchema, emailSchema } from './auth';
import { ROLES, optionalText, requiredText } from './common';

export const familySchema = z.object({
  name: requiredText('Family name', 80),
  description: optionalText(300),
});

export const addMemberSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
  password: passwordSchema.optional(),
  role: z.enum(ROLES).default('MEMBER'),
});

export const updateMemberSchema = z.object({ role: z.enum(ROLES) });
